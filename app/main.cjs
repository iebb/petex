const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, nativeTheme, screen, protocol, net, shell, globalShortcut, powerMonitor } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { Library, normalizeSettings } = require('./library.cjs');
const {findArchive, readBuiltins} = require('./codex-builtins.cjs');
const {DesktopPets}=require('./desktop.cjs');
const {MAX_PETS,newCompanion}=require('./preferences.cjs');
const {FullscreenMonitor} = require('./fullscreen.cjs');
const {resolveLocale,translate,localizeError} = require('./locales.js');

// Keep the original library location so renaming the app preserves existing pets.
app.setPath('userData', process.env.PEDEX_DATA_DIR || path.join(app.getPath('appData'), 'Pedex'));
app.setName('Petex');
// Anonymous image loads need a CORS-enabled scheme to preserve canvas alpha reads.
protocol.registerSchemesAsPrivileged([{scheme: 'pet-asset', privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true}}]);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let library, settings, pets = [], petWindow, settingsWindow, areaWindow, desktop, tray, quitting = false;
let queue = Promise.resolve();
let screenAwake=true, fullscreenHidden=false, fullscreenMonitor, fullscreenTimer=null, shortcutAvailable=false, shortcutEnabled=null,activityReady=false,fullscreenQuery=null,fullscreenIndex=0;
const fullscreenDisplays=new Set();
const SHORTCUT='CommandOrControl+Shift+P';
const locale=()=>resolveLocale(settings?.language==='auto'?app.getLocale():settings?.language);
const t=(key,values)=>translate(locale(),key,values);
const errorText=error=>localizeError(locale(),error);
const petActive=()=>desktop?desktop.active(desktop.primary):!!settings?.visible&&screenAwake&&!(settings.hideFullscreen&&fullscreenHidden);
const enqueue = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
const rendererPath = name => path.join(__dirname, 'renderer', name);
const selectedPet = () => pets.find(p => p.id === settings.petId) || pets[0];
function snapshot(win) {
  const instance=desktop?.fromWindow(win);
  const instances=desktop?[...desktop.instances.values()].map(p=>({id:p.id,petId:desktop.config(p).petId,size:desktop.config(p).size,behaviour:desktop.config(p).behaviour,visible:desktop.config(p).visible,active:desktop.active(p),activity:p.activity,bounds:p.win.getBounds()})):[];
  return {settings:instance?desktop.config(instance):settings,pets,instanceId:instance?.id,instances,displays:screen.getAllDisplays().map(d=>({id:String(d.id),name:d.label||String(d.id),workArea:d.workArea})),platform:process.platform,version:app.getVersion(),locale:locale(),petActive:instance?desktop.active(instance):petActive(),screenAwake,activityReady,fullscreenHidden,resting:desktop?.routineResting||false,shortcutAvailable,fullscreenAvailable:!!fullscreenMonitor?.available,codexImports:!process.mas,loginAvailable:app.isPackaged&&!process.env.PEDEX_DATA_DIR};
}
function broadcast() {
  if(quitting)return;
  for(const win of [...(desktop?.windows||[]),settingsWindow,areaWindow])if(win&&!win.isDestroyed())win.webContents.send('state:changed',snapshot(win));
  updateTray();
}
async function reloadPets(){pets=(await library.list()).map(p=>({...p,displayName:settings.petNames[p.id]||p.displayName}));}
function secure(win) {
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}
function windowOptions() { return {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: true}; }
function resetPosition(){desktop.reset();}
function refreshActivity(){desktop?.refresh();}
function configureShortcut() {
  if(shortcutEnabled===settings.shortcut)return;
  globalShortcut.unregister(SHORTCUT);shortcutEnabled=settings.shortcut;shortcutAvailable=false;
  if(settings.shortcut)shortcutAvailable=globalShortcut.register(SHORTCUT,()=>toggleVisible());
}
function checkFullscreen(initial=false) {
  if(quitting||!desktop||fullscreenMonitor.pending||(!initial&&(!settings.hideFullscreen||!settings.visible||!screenAwake)))return;
  const displays=[...new Map(desktop.windows.map(win=>{const d=screen.getDisplayMatching(win.getBounds());return [String(d.id),d];})).values()];
  const display=displays[fullscreenIndex++%displays.length];fullscreenQuery=String(display.id);
  fullscreenMonitor.check(process.platform==='win32'?screen.dipToScreenRect(null,display.bounds):display.bounds);
}
function configureFullscreen() {
  clearInterval(fullscreenTimer);fullscreenTimer=null;
  if(settings.hideFullscreen&&settings.visible&&screenAwake&&fullscreenMonitor.available){checkFullscreen();fullscreenTimer=setInterval(()=>checkFullscreen(),1500);}
  else{
    fullscreenMonitor.stop();fullscreenDisplays.clear();fullscreenHidden=false;
    // A display change may interrupt the one-time startup lock check.
    if(!activityReady&&fullscreenMonitor.available&&!quitting)checkFullscreen(true);
  }
}
function applySettings(reflow=false) {
  if(quitting||!desktop)return;
  desktop.apply(reflow);configureShortcut();configureFullscreen();updateApplicationMenu();broadcast();
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
  if(quitting)return;
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
    ...(settings.features.multiPet?[{label:t('companions'),submenu:settings.companions.map(c=>({label:pets.find(p=>p.id===c.petId)?.displayName||'Miso',type:'checkbox',checked:c.visible,click:()=>enqueue(async()=>{c.visible=!c.visible;applySettings();await library.saveSettings(settings);})}))}]:[]),
    ...(settings.features.toys?[{label:t('throwBall'),enabled:settings.motion&&settings.visible,click:()=>desktop.throwBall()}]:[]),
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
function petMenu(p=desktop.primary) {
  desktop.cancelSocial();p.walking=null;desktop.schedule();
  Menu.buildFromTemplate([
    {label:t('wave'),click:()=>desktop.action(p,'waving')},
    {label:t('jump'),click:()=>desktop.action(p,'jumping')},
    ...(settings.features.toys?[{label:t('throwBall'),enabled:settings.motion,click:()=>desktop.throwBall()}]:[]),
    {type:'separator'},
    {label:t('settings'),click:showSettings},
    {label:t('hidePet'),click:()=>desktop.hide(p)},
    {type:'separator'},
    {label:t('quit'),click:()=>app.quit()},
  ]).popup({window:p.win});
}
function exportFromMenu(kind){exportLibrary(kind).catch(error=>dialog.showErrorBox(t('export'),errorText(error)));}
async function exportLibrary(kind) {
  if(!['pet','library'].includes(kind))throw new Error(t('exportKind'));
  const pet=selectedPet(),id=kind==='pet'?pet.id:null;
  if(id&&pet.builtin)throw new Error(t('builtinExport'));
  const name=id?pet.displayName:'Petex-library';
  const fileName=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,70)||'Petex-pet';
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
    try { return {ok: true, value: await action.apply(win,args)}; } catch (error) { return {ok: false, error: errorText(error)}; }
  });
}
function configureIPC() {
  const petWindows=()=>desktop.windows;
  const both=()=>[...desktop.windows,settingsWindow,areaWindow].filter(Boolean);
  const settingsOnly = () => [settingsWindow].filter(Boolean);
  handler('state:get',both,function(){return snapshot(this);});
  handler('settings:update', settingsOnly, patch => enqueue(async () => {
    if (!patch || typeof patch !== 'object') throw new Error('Invalid settings.');
    const permitted = ['petId', 'size', 'alwaysOnTop', 'motion', 'randomAnimations', 'followCursor', 'launchAtLogin', 'visible', 'behaviour', 'hideFullscreen', 'snapEdges', 'shortcut', 'language','features','primaryVisible','companions','routine','roamArea','favourites','petNames'];
    const clean = Object.fromEntries(Object.entries(patch).filter(([key]) => permitted.includes(key)));
    if (clean.petId && !pets.some(p => p.id === clean.petId)) throw new Error('That pet is no longer in your collection.');
    if(Object.hasOwn(clean,'behaviour'))clean.randomAnimations=clean.behaviour!=='quiet';
    const next = normalizeSettings({...settings, ...clean});
    if (next.launchAtLogin !== settings.launchAtLogin) {
      if (!snapshot().loginAvailable) throw new Error('Launch at login is available in the installed app.');
      app.setLoginItemSettings({openAtLogin: next.launchAtLogin, ...(process.platform === 'win32' ? {args: ['--hidden']} : {})});
      next.launchAtLogin = app.getLoginItemSettings().openAtLogin;
    }
    settings=next;await reloadPets();
    applySettings(); await library.saveSettings(settings); return snapshot();
  }));
  async function importPaths(paths) {
    const results = [];
    for (const file of paths.slice(0, 30)) {
      try { for(const result of await library.importMany(file))results.push({...result,source:path.basename(file)}); }
      catch (error) { results.push({error:errorText(error), source: path.basename(file)}); }
    }
    await reloadPets();
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
      await reloadPets();
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
    await library.remove(id); await reloadPets();
    if (settings.petId === id) settings.petId = 'miso';
    settings.companions=settings.companions.filter(c=>c.petId!==id);delete settings.petNames[id];settings.favourites=settings.favourites.filter(value=>value!==id);
    applySettings(); await library.saveSettings(settings); return true;
  }));
  handler('pet:home', settingsOnly, () => enqueue(async () => {settings.visible = true; resetPosition(); applySettings(); await library.saveSettings(settings);}));
  handler('pet:play', settingsOnly, name => {
    const valid = selectedPet().builtin ? ['waving','jumping','running-left','running-right'] : ['waving','jumping','failed','waiting','running','review','running-left','running-right'];
    if (!valid.includes(name)) throw new Error('Unsupported animation.');
    desktop.action(desktop.primary,name);
  });
  handler('pets:export', settingsOnly, exportLibrary);
  handler('pet:wander',petWindows,function(name,duration){desktop.wander(desktop.fromWindow(this),name,duration);});
  handler('settings:close',settingsOnly,()=>settingsWindow.close());
  handler('repository:open',settingsOnly,()=>shell.openExternal('https://github.com/iebb/petex'));
  handler('pets:open-folder',settingsOnly,async()=>{const error=await shell.openPath(library.petsPath);if(error)throw new Error(error);});
  handler('pet:menu',petWindows,function(){petMenu(desktop.fromWindow(this));});
  handler('pet:press-start',petWindows,function(){desktop.pressStart(desktop.fromWindow(this));});
  handler('pet:press-end',petWindows,function(){desktop.pressEnd(desktop.fromWindow(this));});
  handler('pet:hit',petWindows,function(hit){desktop.hit(desktop.fromWindow(this),hit);});
  handler('pet:stroke',petWindows,function(){return desktop.petting(desktop.fromWindow(this));});
  handler('companions:add',settingsOnly,id=>enqueue(async()=>{
    if(!settings.features.multiPet||settings.companions.length>=MAX_PETS-1||!pets.some(p=>p.id===id))throw Object.assign(new Error(),{key:'petLimit'});
    const companion=newCompanion(id,settings);settings.companions.push(companion);applySettings();await desktop.instances.get(companion.id).ready;await library.saveSettings(settings);return snapshot();
  }));
  handler('companions:remove',settingsOnly,id=>enqueue(async()=>{settings.companions=settings.companions.filter(c=>c.id!==id);delete settings.placements[id];applySettings();await library.saveSettings(settings);}));
  handler('companions:update',settingsOnly,(id,patch)=>enqueue(async()=>{
    const item=settings.companions.find(c=>c.id===id);if(!item||!patch||typeof patch!=='object')throw new Error('Invalid settings.');
    const allowed=['petId','size','behaviour','followCursor','visible'];
    if(patch.petId&&!pets.some(p=>p.id===patch.petId))throw new Error('That pet is no longer in your collection.');
    Object.assign(item,Object.fromEntries(Object.entries(patch).filter(([key])=>allowed.includes(key))));settings=normalizeSettings(settings);applySettings();await library.saveSettings(settings);
  }));
  handler('pets:interact',settingsOnly,()=>desktop.socialPlan('greet',true));
  handler('toy:show',settingsOnly,()=>desktop.throwBall());
  handler('toy:press',()=>desktop.toy?[desktop.toy.win]:[],pressed=>{if(typeof pressed==='boolean')desktop.toyPress(pressed);});
  handler('area:open',settingsOnly,showAreaPicker);
  handler('area:save',()=>[areaWindow].filter(Boolean),value=>enqueue(async()=>{
    const candidate=normalizeSettings({...settings,roamArea:value}).roamArea;if(!candidate)throw new Error('Invalid settings.');
    settings.roamArea=candidate;areaWindow.close();applySettings();await library.saveSettings(settings);
  }));
  handler('area:close',()=>[areaWindow].filter(Boolean),()=>areaWindow.close());
  handler('layouts:save',settingsOnly,name=>enqueue(async()=>{
    if(!settings.features.layouts||typeof name!=='string'||!name.trim()||settings.layouts.length>=20)throw Object.assign(new Error(),{key:'layoutLimit'});
    for(const p of desktop.instances.values())desktop.remember(p);
    settings.layouts.push({id:require('node:crypto').randomUUID(),name:name.trim().slice(0,50),primary:{petId:settings.petId,size:settings.size,behaviour:settings.behaviour,followCursor:settings.followCursor,primaryVisible:settings.primaryVisible,position:{...settings.position}},companions:structuredClone(settings.companions),placements:structuredClone(settings.placements),multiPet:settings.features.multiPet,personalities:settings.features.personalities});
    await library.saveSettings(settings);broadcast();
  }));
  handler('layouts:restore',settingsOnly,id=>enqueue(async()=>{
    const layout=settings.features.layouts&&settings.layouts.find(p=>p.id===id);if(!layout)throw new Error('Invalid settings.');
    Object.assign(settings,layout.primary);if(!pets.some(p=>p.id===settings.petId))settings.petId='miso';
    settings.companions=structuredClone(layout.companions).filter(c=>pets.some(p=>p.id===c.petId));settings.placements=structuredClone(layout.placements);settings.features.multiPet=layout.multiPet;settings.features.personalities=layout.personalities;settings.randomAnimations=settings.behaviour!=='quiet';applySettings(true);await library.saveSettings(settings);
  }));
  handler('layouts:remove',settingsOnly,id=>enqueue(async()=>{settings.layouts=settings.layouts.filter(p=>p.id!==id);await library.saveSettings(settings);broadcast();}));
}
function showAreaPicker(){
  if(!settings.features.roaming)return;
  if(areaWindow&&!areaWindow.isDestroyed()){areaWindow.focus();return;}
  const display=screen.getAllDisplays().find(d=>String(d.id)===settings.roamArea?.displayId)||screen.getDisplayMatching(petWindow.getBounds());
  areaWindow=new BrowserWindow({...display.workArea,frame:false,transparent:true,hasShadow:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,webPreferences:windowOptions()});secure(areaWindow);
  areaWindow.loadFile(rendererPath('area.html'),{query:{displayId:String(display.id)}});areaWindow.on('closed',()=>areaWindow=null);
}
app.on('second-instance', showSettings);
app.on('activate', () => {if (library) showSettings();});
app.on('window-all-closed', () => {});
app.on('before-quit',()=>{quitting=true;desktop?.dispose();clearInterval(fullscreenTimer);fullscreenMonitor?.stop();globalShortcut.unregisterAll();});
if (locked) app.whenReady().then(async () => {
  library = new Library(app.getPath('userData')); await library.init();
  settings = await library.settings(); await reloadPets();
  fullscreenMonitor=new FullscreenMonitor();
  fullscreenMonitor.on('change',({fullscreen,locked})=>{
    const changed=!activityReady||fullscreenDisplays.has(fullscreenQuery)!==fullscreen;activityReady=true;
    if(fullscreen)fullscreenDisplays.add(fullscreenQuery);else fullscreenDisplays.delete(fullscreenQuery);
    fullscreenHidden=desktop?fullscreenDisplays.has(String(screen.getDisplayMatching(petWindow.getBounds()).id)):false;
    if(locked)screenAwake=false;if(!settings.hideFullscreen||locked||!fullscreenMonitor.available)configureFullscreen();
    if(changed||locked||!fullscreenMonitor.available)refreshActivity();
  });
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
  desktop=new DesktopPets({getState:()=>({settings,pets,screenAwake,fullscreenDisplays}),secure,windowOptions,onChange:broadcast,onSave:()=>enqueue(()=>library.saveSettings(settings))});
  petWindow=desktop.primary.win;configureIPC();await desktop.primary.ready;applySettings();
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
  updateApplicationMenu();desktop.schedule();
  if(fullscreenMonitor.available)checkFullscreen(true);
  screen.on('display-removed',()=>applySettings(true));
  screen.on('display-added',()=>applySettings(true));
  screen.on('display-metrics-changed',()=>applySettings(true));
  if (!process.argv.includes('--hidden') && !app.getLoginItemSettings().wasOpenedAtLogin) showSettings();
}).catch(error => {dialog.showErrorBox(t('startError'),errorText(error)); app.quit();});
