const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, nativeTheme, screen, protocol, net, shell, globalShortcut, powerMonitor } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { Library, normalizeSettings } = require('./library.cjs');
const {findArchive, readBuiltins} = require('./codex-builtins.cjs');
const { DragTracker } = require('./drag.cjs');
const {snapPosition,walkTarget} = require('./placement.cjs');
const {FullscreenMonitor} = require('./fullscreen.cjs');
const {resolveLocale,translate,localizeError} = require('./locales.js');

// Keep the original library location so renaming the app preserves existing pets.
app.setPath('userData', process.env.PEDEX_DATA_DIR || path.join(app.getPath('appData'), 'Pedex'));
app.setName('Petex');
// Anonymous image loads need a CORS-enabled scheme to preserve canvas alpha reads.
protocol.registerSchemesAsPrivileged([{scheme: 'pet-asset', privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true}}]);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let library, settings, pets = [], petWindow, settingsWindow, tray, timer, drag = null, quitting = false;
let queue = Promise.resolve();
let walking=null, screenAwake=true, fullscreenHidden=false, fullscreenMonitor, fullscreenTimer=null, cursorInterval=0, lastCursor=null, shortcutAvailable=false, shortcutEnabled=null,activityReady=false;
const SHORTCUT='CommandOrControl+Shift+P';
const locale=()=>resolveLocale(settings?.language==='auto'?app.getLocale():settings?.language);
const t=(key,values)=>translate(locale(),key,values);
const errorText=error=>localizeError(locale(),error);
const petActive=()=>!!settings?.visible&&screenAwake&&!(settings.hideFullscreen&&fullscreenHidden);
const enqueue = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
const rendererPath = name => path.join(__dirname, 'renderer', name);
const selectedPet = () => pets.find(p => p.id === settings.petId) || pets[0];
const snapshot = () => ({settings, pets, platform: process.platform, version: app.getVersion(), locale:locale(), petActive:petActive(), screenAwake, activityReady, fullscreenHidden, shortcutAvailable, fullscreenAvailable:!!fullscreenMonitor?.available, codexImports: !process.mas, loginAvailable: app.isPackaged && !process.env.PEDEX_DATA_DIR});
function broadcast() {
  for (const win of [petWindow, settingsWindow]) if (win && !win.isDestroyed()) win.webContents.send('state:changed', snapshot());
  updateTray();
}
function secure(win) {
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}
function windowOptions() { return {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: true}; }
function dimensions() { return {width: settings.size + 32, height: Math.ceil(settings.size * 208 / 192) + 32}; }
function clampPosition(position) {
  const {width, height} = dimensions();
  const area = screen.getDisplayNearestPoint({x: Math.round(position.x + width / 2), y: Math.round(position.y + height / 2)}).workArea;
  return {x: Math.round(Math.min(Math.max(position.x, area.x), area.x + area.width - width)), y: Math.round(Math.min(Math.max(position.y, area.y), area.y + area.height - height))};
}
function resetPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  const {width, height} = dimensions();
  settings.position = clampPosition({x: area.x + area.width - width - 64, y: area.y + area.height - height - 24});
  petWindow.setPosition(settings.position.x, settings.position.y);
}
function refreshActivity() {
  if(!petWindow||petWindow.isDestroyed())return;
  if(!petActive()){if(drag)finishPress();stopWalking();petWindow.hide();}
  else if(!petWindow.isVisible())petWindow.showInactive();
  updateCursorSchedule();broadcast();
}
function configureShortcut() {
  if(shortcutEnabled===settings.shortcut)return;
  globalShortcut.unregister(SHORTCUT);shortcutEnabled=settings.shortcut;shortcutAvailable=false;
  if(settings.shortcut)shortcutAvailable=globalShortcut.register(SHORTCUT,()=>toggleVisible());
}
function checkFullscreen(initial=false) {
  if(!initial&&(!settings.hideFullscreen||!settings.visible||!screenAwake))return;
  const display=screen.getDisplayMatching(petWindow.getBounds());
  const bounds=process.platform==='win32'?screen.dipToScreenRect(null,display.bounds):display.bounds;
  fullscreenMonitor.check(bounds);
}
function configureFullscreen() {
  clearInterval(fullscreenTimer);fullscreenTimer=null;
  if(settings.hideFullscreen&&settings.visible&&screenAwake&&fullscreenMonitor.available){
    checkFullscreen();fullscreenTimer=setInterval(()=>checkFullscreen(),1500);
  }else{fullscreenMonitor.stop();fullscreenHidden=false;}
}
function applySettings() {
  if(!petWindow||petWindow.isDestroyed())return;
  stopWalking();
  const {width,height}=dimensions(),current=petWindow.getBounds();
  const pos=clampPosition(settings.position||current);
  petWindow.setBounds({...pos,width,height});settings.position=pos;
  petWindow.setAlwaysOnTop(settings.alwaysOnTop,'floating');
  if(process.platform==='darwin')petWindow.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  configureShortcut();configureFullscreen();updateApplicationMenu();refreshActivity();
}
function toggleVisible() {
  return enqueue(async()=>{settings.visible=!settings.visible;applySettings();await library.saveSettings(settings);});
}
function selectPet(id) {
  return enqueue(async()=>{if(!pets.some(p=>p.id===id))return;settings.petId=id;settings.visible=true;applySettings();await library.saveSettings(settings);});
}
function updateApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Petex',submenu:[{label:t('settings'),accelerator:'CommandOrControl+,',click:showSettings},{label:t('quit'),accelerator:'CommandOrControl+Q',click:()=>app.quit()}]},{label:t('edit'),submenu:[{role:'undo',label:t('undo')},{role:'redo',label:t('redo')},{type:'separator'},{role:'cut',label:t('cut')},{role:'copy',label:t('copy')},{role:'paste',label:t('paste')},{role:'selectAll',label:t('selectAll')}]}]));
}
function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({width: 700, height: 740, minWidth: 600, minHeight: 660, title: 'Petex', backgroundColor: '#f7f8f2', titleBarStyle: 'hidden', ...(process.platform === 'darwin' ? {trafficLightPosition: {x: 20, y: 21}} : {titleBarOverlay: {color: '#f7f8f2', symbolColor: '#354330', height: 42}}), autoHideMenuBar: true, show: false, webPreferences: windowOptions()});
  secure(settingsWindow);
  settingsWindow.loadFile(rendererPath('settings.html'));
  settingsWindow.once('ready-to-show', () => {settingsWindow.show(); settingsWindow.focus();});
  settingsWindow.on('closed', () => {settingsWindow = null;});
}
function updateTray() {
  if(!tray||!settings)return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:`Petex · ${selectedPet().displayName}`,enabled:false},
    {label:t('selectPet'),submenu:pets.map(p=>({label:p.displayName,type:'radio',checked:p.id===settings.petId,click:()=>selectPet(p.id)}))},
    {label:t('settings'),click:showSettings},
    {type:'separator'},
    {label:t(settings.visible?'hidePet':'showPet'),click:toggleVisible},
    {label:t(settings.motion?'pauseTray':'resumeTray'),click:()=>enqueue(async()=>{settings.motion=!settings.motion;applySettings();await library.saveSettings(settings);})},
    {label:t('resetTray'),click:()=>enqueue(async()=>{settings.visible=true;resetPosition();applySettings();await library.saveSettings(settings);})},
    {label:t('export'),submenu:[{label:t('exportPet'),enabled:!selectedPet().builtin,click:()=>exportFromMenu('pet')},{label:t('backup'),enabled:pets.length>1,click:()=>exportFromMenu('library')}]},
    {type:'separator'},
    {label:t('quit'),accelerator:'CommandOrControl+Q',click:()=>app.quit()},
  ]));
}
function petMenu() {
  stopWalking();updateCursorSchedule();
  Menu.buildFromTemplate([
    {label:t('wave'),click:()=>petWindow.webContents.send('pet:action','waving')},
    {label:t('jump'),click:()=>petWindow.webContents.send('pet:action','jumping')},
    {type:'separator'},
    {label:t('settings'),click:showSettings},
    {label:t('hidePet'),click:toggleVisible},
    {type:'separator'},
    {label:t('quit'),click:()=>app.quit()},
  ]).popup({window:petWindow});
}
function exportFromMenu(kind){exportLibrary(kind).catch(error=>dialog.showErrorBox(t('export'),errorText(error)));}
async function exportLibrary(kind) {
  if(!['pet','library'].includes(kind))throw new Error(t('exportKind'));
  const pet=selectedPet(),id=kind==='pet'?pet.id:null;
  if(id&&pet.builtin)throw new Error(t('builtinExport'));
  const name=id?pet.displayName:'Petex-library';
  const fileName=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/\.\.+/g,'-').replace(/[. ]+$/,'').slice(0,70)||'Petex-pet';
  const result=await dialog.showSaveDialog(settingsWindow||petWindow,{title:t(id?'exportTitle':'backupTitle',{name:pet.displayName}),defaultPath:fileName+'.zip',filters:[{name:t('zipFiles'),extensions:['zip']}]});
  if(result.canceled||!result.filePath)return false;
  const actualParent=await fs.realpath(path.dirname(result.filePath));
  const actualLibrary=await fs.realpath(library.petsPath);
  const relative=path.relative(actualLibrary,actualParent);
  if(relative===''||(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw new Error(t('exportInside'));
  return enqueue(async()=>{await fs.writeFile(result.filePath,await library.exportBytes(id));return true;});
}
function handler(channel, allowed, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!allowed().includes(win) || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted request.');
    try { return {ok: true, value: await action(...args)}; } catch (error) { return {ok: false, error: errorText(error)}; }
  });
}
function updateDrag(cursor) {
  if (!drag) return null;
  const state = drag.update(cursor, performance.now());
  if (state.dragging) {
    const position = clampPosition(state.position);
    const current = petWindow.getBounds();
    if (position.x !== current.x || position.y !== current.y) petWindow.setPosition(position.x, position.y);
  }
  return state;
}
function stopWalking() {
  if(walking){walking=null;settings.position=clampPosition(petWindow.getBounds());}
}
function updateWalk(now) {
  if(!walking)return;
  const progress=Math.min(1,(now-walking.started)/walking.duration);
  const eased=progress*progress*(3-2*progress);
  const x=Math.round(walking.origin.x+(walking.target.x-walking.origin.x)*eased);
  petWindow.setPosition(x,walking.origin.y);
  if(progress>=1){stopWalking();enqueue(()=>library.saveSettings(settings));updateCursorSchedule();}
}
function startWalk(name,duration) {
  if(!petActive()||!settings.motion||!settings.randomAnimations||drag||!['running-left','running-right'].includes(name)||!Number.isFinite(duration)||duration<250||duration>3600)throw new Error(t('walkError'));
  const origin=petWindow.getBounds(),area=screen.getDisplayMatching(origin).workArea;
  const target=walkTarget(origin,area,name,Math.max(24,Math.min(96,settings.size*.65)));
  walking={origin,target,started:performance.now(),duration};updateCursorSchedule();
}
function pollCursor() {
  if(!petActive()||petWindow.isDestroyed())return;
  if(walking)updateWalk(performance.now());
  const cursor=screen.getCursorScreenPoint(),bounds=petWindow.getBounds();
  const movement=updateDrag(cursor);
  const inside=cursor.x>=bounds.x&&cursor.y>=bounds.y&&cursor.x<bounds.x+bounds.width&&cursor.y<bounds.y+bounds.height;
  if(!drag&&!walking&&!inside&&lastCursor&&lastCursor.x===cursor.x&&lastCursor.y===cursor.y)return;
  lastCursor=cursor;
  petWindow.webContents.send('pet:cursor',{x:cursor.x-bounds.x,y:cursor.y-bounds.y,dragging:movement?.dragging||false,direction:movement?.direction||null,dragGaze:movement?.gaze||null,walking:!!walking});
}
function updateCursorSchedule() {
  const interval=!petActive()?0:drag?16:walking?33:settings.motion?50:120;
  if(interval===cursorInterval)return;
  clearInterval(timer);timer=null;cursorInterval=interval;lastCursor=null;
  if(interval){timer=setInterval(pollCursor,interval);pollCursor();}
}
function finishPress() {
  if(drag){
    updateDrag(screen.getCursorScreenPoint());const wasDragging=drag.dragging;drag=null;
    let position=clampPosition(petWindow.getBounds());
    if(wasDragging&&settings.snapEdges){const bounds=petWindow.getBounds();position=snapPosition(bounds,screen.getDisplayMatching(bounds).workArea);}
    settings.position=position;petWindow.setPosition(position.x,position.y);
  }
  updateCursorSchedule();
}
function configureIPC() {
  const both = () => [petWindow, settingsWindow].filter(Boolean);
  const settingsOnly = () => [settingsWindow].filter(Boolean);
  handler('state:get', both, () => snapshot());
  handler('settings:update', settingsOnly, patch => enqueue(async () => {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid settings.');
    const permitted = ['petId', 'size', 'alwaysOnTop', 'motion', 'randomAnimations', 'followCursor', 'launchAtLogin', 'visible', 'behaviour', 'hideFullscreen', 'snapEdges', 'shortcut', 'language'];
    const clean = Object.fromEntries(Object.entries(patch).filter(([key]) => permitted.includes(key)));
    if (clean.petId && !pets.some(p => p.id === clean.petId)) throw new Error('That pet is no longer in your collection.');
    if(Object.hasOwn(clean,'behaviour'))clean.randomAnimations=clean.behaviour!=='quiet';
    const next = normalizeSettings({...settings, ...clean});
    if (next.launchAtLogin !== settings.launchAtLogin) {
      if (!snapshot().loginAvailable) throw new Error('Launch at login is available in the installed app.');
      app.setLoginItemSettings({openAtLogin: next.launchAtLogin, ...(process.platform === 'win32' ? {args: ['--hidden']} : {})});
      next.launchAtLogin = app.getLoginItemSettings().openAtLogin;
    }
    settings = next;
    applySettings(); await library.saveSettings(settings); return snapshot();
  }));
  async function importPaths(paths) {
    const results = [];
    for (const file of paths.slice(0, 30)) {
      try { for(const result of await library.importMany(file))results.push({...result,source:path.basename(file)}); }
      catch (error) { results.push({error:errorText(error), source: path.basename(file)}); }
    }
    pets = await library.list();
    const first = results.find(r => r.pet);
    if (first) {settings.petId = first.pet.id; settings.visible = true;}
    applySettings(); await library.saveSettings(settings); return results;
  }
  handler('pets:import-dialog', settingsOnly, async kind => {
    const result = await dialog.showOpenDialog(settingsWindow, kind === 'folder' ? {title:t('folderPicker'), properties: ['openDirectory']} : {title:t('filePicker'), properties: ['openFile', 'multiSelections'], filters: [{name:t('petFiles'), extensions: ['zip', 'json', 'png', 'webp']}]});
    if (result.canceled) return [];
    return enqueue(() => importPaths(result.filePaths));
  });
  handler('pets:import-dropped', settingsOnly, paths => {
    if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string')) throw new Error('Drop a pet folder or file.');
    return enqueue(() => importPaths(paths));
  });
  handler('pets:import-builtins', settingsOnly, async () => {
    if(process.mas)throw new Error('Codex imports are available in the GitHub build.');
    let archive = await findArchive(process.env.PEDEX_CODEX_APP);
    if (!archive) {
      const result = await dialog.showOpenDialog(settingsWindow, {title:t('appPicker'), properties:['openFile','openDirectory'], defaultPath:process.platform === 'darwin' ? '/Applications' : undefined});
      if(result.canceled)return [];
      archive = await findArchive(result.filePaths[0]);
      if(!archive)throw new Error('Choose the ChatGPT or Codex app, its installation folder, or app.asar.');
    }
    const builtins = await readBuiltins(archive);
    return enqueue(async () => {
      const results=[];
      for(const {manifest,bytes} of builtins)results.push({...await library.importSprite(manifest,bytes),source:manifest.displayName});
      pets=await library.list();
      const added=results.find(r=>!r.duplicate);
      if(added){settings.petId=added.pet.id;settings.visible=true;}
      applySettings();await library.saveSettings(settings);return results;
    });
  });
  handler('pets:discover', settingsOnly, () => enqueue(async () => {
    if(process.mas)throw new Error('Codex imports are available in the GitHub build.');
    const home = process.env.PEDEX_CODEX_HOME || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const found = await library.discover(home);
    return {found: found.length, results: await importPaths(found.map(p => p.source))};
  }));
  handler('pets:remove', settingsOnly, id => enqueue(async () => {
    const pet = pets.find(p => p.id === id && !p.builtin);
    if (!pet) throw new Error('This pet cannot be removed.');
    const answer = await dialog.showMessageBox(settingsWindow, {type: 'question', message:t('removeTitle',{name:pet.displayName}),detail:t('removeDetail'),buttons:[t('keep'),t('remove')], defaultId: 0, cancelId: 0});
    if (answer.response !== 1) return false;
    await library.remove(id); pets = await library.list();
    if (settings.petId === id) settings.petId = 'miso';
    applySettings(); await library.saveSettings(settings); return true;
  }));
  handler('pet:home', settingsOnly, () => enqueue(async () => {settings.visible = true; resetPosition(); applySettings(); await library.saveSettings(settings);}));
  handler('pet:play', settingsOnly, name => {
    const valid = selectedPet().builtin ? ['waving','jumping','running-left','running-right'] : ['waving','jumping','failed','waiting','running','review','running-left','running-right'];
    if (!valid.includes(name)) throw new Error('Unsupported animation.');
    stopWalking();updateCursorSchedule();
    petWindow.webContents.send('pet:action', name);
  });
  handler('pets:export', settingsOnly, exportLibrary);
  handler('pet:wander', () => [petWindow], startWalk);
  handler('settings:close', settingsOnly, () => settingsWindow.close());
  handler('repository:open', settingsOnly, () => shell.openExternal('https://github.com/iebb/petex'));
  handler('pets:open-folder', settingsOnly, async () => {
    const error = await shell.openPath(library.petsPath);
    if (error) throw new Error(error);
  });
  handler('pet:menu', () => [petWindow], petMenu);
  handler('pet:press-start', () => [petWindow], () => {
    stopWalking();
    if(!petActive())return;
    drag = new DragTracker(screen.getCursorScreenPoint(), petWindow.getBounds(), performance.now());
    petWindow.setIgnoreMouseEvents(false);
    updateCursorSchedule();
  });
  handler('pet:press-end', () => [petWindow], () => {
    finishPress();
    return enqueue(() => library.saveSettings(settings));
  });
  handler('pet:hit', () => [petWindow], hit => {if (!drag) petWindow.setIgnoreMouseEvents(hit !== true, {forward: true});});
}
app.on('second-instance', showSettings);
app.on('activate', () => {if (library) showSettings();});
app.on('window-all-closed', () => {});
app.on('before-quit',()=>{quitting=true;clearInterval(timer);clearInterval(fullscreenTimer);fullscreenMonitor?.stop();globalShortcut.unregisterAll();});
if (locked) app.whenReady().then(async () => {
  library = new Library(app.getPath('userData')); await library.init();
  settings = await library.settings(); pets = await library.list();
  fullscreenMonitor=new FullscreenMonitor();
  fullscreenMonitor.on('change',({fullscreen,locked})=>{const changed=fullscreenHidden!==fullscreen||!activityReady;activityReady=true;fullscreenHidden=fullscreen;if(locked)screenAwake=false;if(!settings.hideFullscreen||locked||!fullscreenMonitor.available)configureFullscreen();if(changed||locked||!fullscreenMonitor.available)refreshActivity();});
  activityReady=!fullscreenMonitor.available;
  const awake=value=>{screenAwake=value;configureFullscreen();refreshActivity();};
  powerMonitor.on('suspend',()=>awake(false));powerMonitor.on('lock-screen',()=>awake(false));
  powerMonitor.on('resume',()=>awake(powerMonitor.getSystemIdleState(60)!=='locked'));powerMonitor.on('unlock-screen',()=>awake(true));
  screenAwake=powerMonitor.getSystemIdleState(60)!=='locked';
  if (!pets.some(p => p.id === settings.petId)) settings.petId = 'miso';
  if (snapshot().loginAvailable) settings.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  protocol.handle('pet-asset', async request => {
    const url = new URL(request.url);
    const match = /^\/([a-f0-9-]{36})\/(spritesheet\.(?:png|webp))$/.exec(url.pathname);
    if (url.hostname !== 'library' || !match || !pets.some(p => p.id === match[1])) return new Response('Not found', {status: 404});
    const file = path.join(library.petsPath, match[1], match[2]);
    try {
      const actual = await fs.realpath(file);
      if (path.dirname(actual) !== await fs.realpath(path.dirname(file))) return new Response('Forbidden', {status: 403});
      const response = await net.fetch(pathToFileURL(actual).href);
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, {status: response.status, headers});
    } catch { return new Response('Not found', {status: 404}); }
  });
  petWindow = new BrowserWindow({...dimensions(), frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, show: false, title: 'Petex pet', webPreferences: windowOptions()});
  secure(petWindow);
  petWindow.setIgnoreMouseEvents(true, {forward: true});
  petWindow.on('close', e => {if (!quitting) {e.preventDefault(); petWindow.hide();}});
  configureIPC();
  await petWindow.loadFile(rendererPath('pet.html'));
  if (!settings.position) resetPosition();
  applySettings();
  function trayIcon() {
    const file = process.platform === 'darwin' ? 'trayTemplate.png' : nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? 'trayLight.png' : 'tray.png';
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    return icon;
  }
  tray = new Tray(trayIcon());
  nativeTheme.on('updated', () => {if (tray && !tray.isDestroyed()) tray.setImage(trayIcon());});
  tray.setToolTip('Petex');
  tray.on('double-click', showSettings);
  updateTray();
  if (process.platform === 'darwin') app.dock.hide();
  updateApplicationMenu();updateCursorSchedule();
  if(fullscreenMonitor.available)checkFullscreen(true);
  screen.on('display-removed', () => enqueue(async () => {settings.position = clampPosition(petWindow.getBounds()); applySettings(); await library.saveSettings(settings);}));
  screen.on('display-metrics-changed', () => applySettings());
  if (!process.argv.includes('--hidden') && !app.getLoginItemSettings().wasOpenedAtLogin) showSettings();
}).catch(error => {dialog.showErrorBox(t('startError'),errorText(error)); app.quit();});
