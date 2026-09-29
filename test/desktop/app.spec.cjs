const {test,expect,_electron:electron}=require('@playwright/test');
const asar=require('@electron/asar');
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const sharp=require('sharp');
let application,settingsPage,petPage,root,dragOrigin;
test.beforeEach(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'pedex-desktop-'));
  const fixture=path.join(root,'codex','pets','fixture');await fs.mkdir(fixture,{recursive:true});
  const pixels=Buffer.alloc(1536*2288*4);pixels.fill(Buffer.from([25,160,210,255]));
  pixels.fill(Buffer.from([220,70,140,255]),3*1536*208*4,4*1536*208*4);
  pixels.fill(Buffer.from([15,210,80,255]),4*1536*208*4,5*1536*208*4);
  for(let i=0;i<16;i++){const row=9+Math.floor(i/8),col=i%8;for(let y=row*208;y<(row+1)*208;y++)pixels.fill(Buffer.from([20+i*10,60,120,255]),(y*1536+col*192)*4,(y*1536+(col+1)*192)*4);}
  pixels.fill(Buffer.from([90,40,200,255]),7*1536*208*4,8*1536*208*4);
  const atlas=await sharp(pixels,{raw:{width:1536,height:2288,channels:4}}).webp({lossless:true}).toBuffer();
  await fs.writeFile(path.join(fixture,'spritesheet.webp'),atlas);await fs.writeFile(path.join(fixture,'pet.json'),JSON.stringify({displayName:'Sunny test pet',spriteVersionNumber:2,spritesheetPath:'spritesheet.webp'}));
  await fs.mkdir(path.join(root,'data'),{recursive:true});
  await fs.writeFile(path.join(root,'data','settings.json'),JSON.stringify({followCursor:false,language:'en-GB',shortcut:false}));
  const appAssets=path.join(root,'codex-app','webview','assets');await fs.mkdir(appAssets,{recursive:true});
  await fs.writeFile(path.join(appAssets,'dewey-spritesheet-v5-fixture.webp'),atlas);
  const codexArchive=path.join(root,'app.asar');await asar.createPackage(path.join(root,'codex-app'),codexArchive);
  application=await electron.launch({...(process.env.PEDEX_EXECUTABLE ? {executablePath:process.env.PEDEX_EXECUTABLE,args:[]} : {args:[path.join(__dirname,'../..')]}),env:{...process.env,PEDEX_CODEX_APP:codexArchive,PEDEX_DATA_DIR:path.join(root,'data'),PEDEX_CODEX_HOME:path.join(root,'codex')}});
  await expect.poll(async()=>application.windows().map(page=>path.basename(page.url())).sort(),{timeout:20000}).toEqual(['pet.html','settings.html']);
  settingsPage=application.windows().find(p=>p.url().endsWith('settings.html'));petPage=application.windows().find(p=>p.url().endsWith('pet.html'));
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).activityReady)).toBe(true);
  await application.evaluate(({powerMonitor})=>powerMonitor.emit('unlock-screen'));
  await expect(settingsPage.locator('h1')).toHaveText('Miso');
});
test.afterEach(async()=>{await application?.close();await fs.rm(root,{recursive:true,force:true});});
test('renders the native companion, settings, and working controls',async()=>{
  await expect(settingsPage.getByRole('button',{name:'Choose Miso'})).toHaveAttribute('aria-pressed','true');
  const before=await petPage.locator('canvas').screenshot();
  await settingsPage.screenshot({path:'test-results/settings.png'});
  await settingsPage.getByRole('button',{name:'Play',exact:true}).click();
  await expect.poll(async()=>Buffer.compare(before,await petPage.locator('canvas').screenshot())).not.toBe(0);
  await settingsPage.locator('#motion').uncheck({force:true});
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).settings.motion)).toBe(false);
  await expect(settingsPage.locator('#followCursor')).toBeDisabled();
  await expect(settingsPage.locator('#behaviour')).toBeDisabled();
  await expect(settingsPage.locator('#play')).toBeDisabled();
  await settingsPage.locator('#visible').uncheck({force:true});
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').isVisible())).toBe(false);
  await settingsPage.getByRole('button',{name:'Reset position'}).click();
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').isVisible())).toBe(true);
});
test('discovers real-format Codex pets, deduplicates and persists selection',async()=>{
  await settingsPage.getByRole('button',{name:'Import from Codex'}).click();
  await expect(settingsPage.getByRole('button',{name:'Choose Sunny test pet'})).toHaveAttribute('aria-pressed','true');
  await expect(settingsPage.locator('#pet-count')).toHaveText('2');
  await settingsPage.getByRole('button',{name:'Import from Codex'}).click();
  await expect(settingsPage.locator('#toast')).toContainText('Already imported.');
  await expect(settingsPage.locator('#pet-count')).toHaveText('2');
  // Assert actual imported pixels in every view; the fallback cat is also opaque.
  const importedCard=settingsPage.getByRole('button',{name:'Choose Sunny test pet'});
  await expect(importedCard.locator('.pet-name')).toHaveText('Sunny test pet');
  for(const canvas of [petPage.locator('canvas'),settingsPage.locator('#hero-pet'),importedCard.locator('canvas')]){
    await expect.poll(()=>canvas.evaluate(node=>Array.from(node.getContext('2d').getImageData(192,208,1,1).data))).toEqual([25,160,210,255]);
  }
  await settingsPage.reload();
  await expect(settingsPage.getByRole('button',{name:'Choose Sunny test pet'}).locator('.pet-name')).toHaveText('Sunny test pet');
  await expect.poll(()=>settingsPage.locator('#hero-pet').evaluate(node=>Array.from(node.getContext('2d').getImageData(192,208,1,1).data))).toEqual([25,160,210,255]);
  const state=await settingsPage.evaluate(()=>window.pedex.getState());
  const response=await application.evaluate(async({net},{url})=>{const r=await net.fetch(url);return {status:r.status,size:(await r.arrayBuffer()).byteLength};},{url:state.pets[1].assetUrl});
  expect(response.status).toBe(200);expect(response.size).toBeGreaterThan(0);
  const config=JSON.parse(await fs.readFile(path.join(root,'data','settings.json'),'utf8'));expect(config.petId).toBe(state.pets[1].id);
  await settingsPage.getByRole('button',{name:'Choose Miso'}).click();await expect(settingsPage.getByRole('button',{name:'Choose Miso'})).toHaveAttribute('aria-pressed','true');
});
test('keeps native capabilities isolated and Done leaves the pet running',async()=>{
  expect(await settingsPage.evaluate(()=>typeof require)).toBe('undefined');
  const preferences=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>w.webContents.getLastWebPreferences()));
  for(const p of preferences){expect(p.nodeIntegration).toBe(false);expect(p.contextIsolation).toBe(true);expect(p.sandbox).toBe(true);}
  const denied=await petPage.evaluate(async()=>{try{await window.pedex.updateSettings({size:999});return false;}catch{return true;}});expect(denied).toBe(true);
  await Promise.all([
    settingsPage.waitForEvent('close'),
    settingsPage.getByRole('button',{name:'Done',exact:true}).click({noWaitAfter:true}).catch(error=>{if(!settingsPage.isClosed())throw error;}),
  ]);
  await expect.poll(async()=>application.windows().length).toBe(1);
  expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle())).toBe('Petex pet');
});

test('plays selected and random animation rows, then returns to idle',async()=>{
  await settingsPage.getByRole('button',{name:'Import from Codex'}).click();
  await expect(settingsPage.getByRole('button',{name:'Choose Sunny test pet'})).toHaveAttribute('aria-pressed','true');
  await settingsPage.locator('#animation').selectOption('running');
  await settingsPage.getByRole('button',{name:'Play',exact:true}).click();
  const pixel=()=>petPage.locator('canvas').evaluate(node=>Array.from(node.getContext('2d').getImageData(192,208,1,1).data));
  await expect.poll(pixel).toEqual([90,40,200,255]);
  await expect.poll(pixel).toEqual([25,160,210,255]);
  await petPage.clock.install();
  await petPage.clock.pauseAt(await petPage.evaluate(()=>new Date(Date.now()+100).toISOString()));
  await petPage.evaluate(()=>{Math.random=()=>0;});
  await settingsPage.locator('#behaviour').selectOption('quiet');
  await settingsPage.locator('#behaviour').selectOption('playful');
  await expect.poll(()=>petPage.evaluate(async()=>(await window.pedex.getState()).settings.behaviour)).toBe('playful');
  await petPage.clock.runFor(15001);
  await expect.poll(pixel).toEqual([220,70,140,255]);
  await petPage.clock.runFor(701);
  await expect.poll(pixel).toEqual([25,160,210,255]);
  await settingsPage.locator('#behaviour').selectOption('quiet');
  await petPage.clock.fastForward(60000);
  await expect.poll(pixel).toEqual([25,160,210,255]);
  const config=JSON.parse(await fs.readFile(path.join(root,'data','settings.json'),'utf8'));
  expect(config.randomAnimations).toBe(false);
});

async function preparePointerTest(){
  await settingsPage.getByRole('button',{name:'Import from Codex'}).click();
  await expect(settingsPage.locator('h1')).toHaveText('Sunny test pet');
  await settingsPage.evaluate(()=>window.pedex.updateSettings({randomAnimations:false,followCursor:false}));
  dragOrigin=await application.evaluate(({screen,BrowserWindow})=>{
    const win=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet');
    const origin=win.getBounds();win.setIgnoreMouseEvents(false);
    globalThis.testCursor={x:origin.x+96,y:origin.y+90};
    screen.getCursorScreenPoint=()=>({...globalThis.testCursor});
    return origin;
  });
  await petPage.mouse.move(96,90);
}
const desktopPixel=()=>petPage.locator('canvas').evaluate(node=>Array.from(node.getContext('2d').getImageData(192,208,1,1).data));
test('a long press jumps once and release does not replace it with a wave',async()=>{
  await preparePointerTest();
  await petPage.mouse.down();
  await expect.poll(desktopPixel).toEqual([15,210,80,255]);
  await petPage.mouse.up();
  expect(await desktopPixel()).toEqual([15,210,80,255]);
  await expect.poll(desktopPixel).toEqual([25,160,210,255]);
  // A short click still waves.
  await petPage.mouse.down();await petPage.mouse.up();
  await expect.poll(desktopPixel).toEqual([220,70,140,255]);
});
test('native drag follows movement, keeps its facing when stopped, and cancels long press',async()=>{
  await preparePointerTest();
  await petPage.mouse.down();
  await petPage.evaluate(()=>window.pedex.getState());
  await application.evaluate(()=>{globalThis.testCursor.x-=80;});
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').getBounds().x)).toBe(dragOrigin.x-80);
  // v2 look-left (sector 12), not an animation row or a right-facing rest frame.
  await expect.poll(desktopPixel).toEqual([140,60,120,255]);
  const frames=await petPage.locator('canvas').evaluate(async node=>{
    const samples=[];for(let i=0;i<9;i++){await new Promise(resolve=>setTimeout(resolve,80));samples.push(Array.from(node.getContext('2d').getImageData(192,208,1,1).data));}return samples;
  });
  expect(frames.every(pixel=>JSON.stringify(pixel)==='[140,60,120,255]')).toBe(true);
  await application.evaluate(()=>{globalThis.testCursor.y-=80;});
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').getBounds().y)).toBe(dragOrigin.y-80);
  // A further upward movement lets the filtered heading settle to up.
  for(let i=0;i<6;i++){await application.evaluate(()=>{globalThis.testCursor.y-=10;});await new Promise(resolve=>setTimeout(resolve,30));}
  await expect.poll(desktopPixel).toEqual([20,60,120,255]);
  await petPage.mouse.up();
  await expect.poll(desktopPixel).toEqual([25,160,210,255]);
  await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(root,'data','settings.json'),'utf8')).position).toEqual({x:dragOrigin.x-80,y:dragOrigin.y-140});
});

test('supports 48 px pets and persists the smaller size',async()=>{
  await settingsPage.locator('#size').focus();
  await settingsPage.locator('#size').press('Home');
  await expect(settingsPage.locator('#size')).toHaveValue('48');
  await expect(settingsPage.locator('#size-description')).toHaveText('48 px');
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').getBounds().width)).toBe(80);
  await expect.poll(async()=>JSON.parse(await fs.readFile(path.join(root,'data','settings.json'),'utf8')).size).toBe(48);
});

test('GitHub link opens the project repository in the external browser',async()=>{
  await application.evaluate(({shell})=>{shell.openExternal=async url=>{globalThis.openedRepository=url;};});
  await settingsPage.getByRole('link',{name:'GitHub',exact:true}).click();
  await expect.poll(()=>application.evaluate(()=>globalThis.openedRepository)).toBe('https://github.com/iebb/petex');
});


test('imports built-in pets and deletes their local copies with the visible button',async()=>{
  await expect(settingsPage.getByRole('button',{name:'Delete',exact:true})).toBeHidden();
  await settingsPage.getByRole('button',{name:'Built-in pets',exact:true}).click();
  await expect(settingsPage.getByRole('button',{name:'Choose Dewey'})).toHaveAttribute('aria-pressed','true');
  await expect.poll(desktopPixel).toEqual([25,160,210,255]);
  await settingsPage.getByRole('button',{name:'Built-in pets',exact:true}).click();
  await expect(settingsPage.locator('#pet-count')).toHaveText('2');
  await application.evaluate(({dialog})=>{globalThis.deleteDialogs=0;dialog.showMessageBox=async()=>{globalThis.deleteDialogs++;return {response:0};};});
  await settingsPage.getByRole('button',{name:'Delete',exact:true}).click();
  await expect.poll(()=>application.evaluate(()=>globalThis.deleteDialogs)).toBe(1);
  await expect(settingsPage.locator('#pet-count')).toHaveText('2');
  await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
  await settingsPage.getByRole('button',{name:'Delete',exact:true}).click();
  await expect(settingsPage.locator('#pet-count')).toHaveText('1');
  await expect(settingsPage.locator('h1')).toHaveText('Miso');
  expect(await fs.readdir(path.join(root,'data','pets'))).toEqual([]);
  await fs.access(path.join(root,'app.asar'));
  await settingsPage.getByRole('button',{name:'Built-in pets',exact:true}).click();
  await expect(settingsPage.locator('h1')).toHaveText('Dewey');
});

test('Store mode hides and blocks Codex imports while retaining file imports',async()=>{
  await application.evaluate(()=>{process.mas=true;});
  await settingsPage.reload();
  await expect(settingsPage.getByRole('button',{name:'Built-in pets',exact:true})).toBeHidden();
  await expect(settingsPage.getByRole('button',{name:'Import from Codex',exact:true})).toBeHidden();
  await expect(settingsPage.getByRole('button',{name:'import a file',exact:true})).toBeVisible();
  const errors=await settingsPage.evaluate(async()=>{const result=[];for(const fn of [window.pedex.importBuiltins,window.pedex.discoverPets]){try{await fn();result.push(null);}catch(e){result.push(e.message);}}return result;});
  expect(errors).toEqual(['Codex imports are available in the GitHub build.','Codex imports are available in the GitHub build.']);
});

test('changes every app language and translates native menus and import errors',async()=>{
  const {messages}=require('../../app/locales.js');
  await application.evaluate(({Menu})=>{const original=Menu.buildFromTemplate;Menu.buildFromTemplate=function(template){const menu=original.call(this,template);if(template[0]?.label?.startsWith('Petex ·'))globalThis.testTray=menu;return menu;};});
  for(const language of ['zh-Hans','zh-Hant','ja','es','fr','en-GB']){
    await settingsPage.locator('#language').selectOption(language);
    await expect(settingsPage.locator('#done')).toHaveText(messages[language].done);
    await expect(settingsPage.locator('#behaviour option[value="calm"]')).toHaveText(messages[language].calm);
    await expect(settingsPage.locator('#play')).toHaveText(messages[language].play);
    const menuLabel=await application.evaluate(()=>globalThis.testTray.items[2].label);
    expect(menuLabel).toBe(messages[language].settings);
  }
  await settingsPage.locator('#language').selectOption('ja');
  await application.evaluate(()=>{process.mas=true;});
  const error=await settingsPage.evaluate(async()=>{try{await window.pedex.discoverPets();}catch(e){return e.message;}});
  expect(error).toBe(messages.ja.codexRestricted);
  await settingsPage.screenshot({path:'test-results/settings-japanese.png'});
  await settingsPage.locator('#language').selectOption('fr');
  await settingsPage.screenshot({path:'test-results/settings-french.png'});
  expect(await settingsPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('exports an individual pet and restores a library backup through the import picker',async()=>{
  await settingsPage.getByRole('button',{name:'Import from Codex'}).click();
  const exported=path.join(root,'pet-export.zip'),backup=path.join(root,'library-backup.zip');
  await application.evaluate(({dialog},{file})=>{dialog.showSaveDialog=async()=>({filePath:file,canceled:false});},{file:exported});
  await settingsPage.locator('#export-pet').click();await expect(settingsPage.locator('#toast')).toHaveText('Export saved.');
  const AdmZip=require('adm-zip'),one=new AdmZip(await fs.readFile(exported));
  expect(JSON.parse(one.getEntry('pet.json').getData()).displayName).toBe('Sunny test pet');
  await application.evaluate(({dialog},{file})=>{dialog.showSaveDialog=async()=>({filePath:file,canceled:false});},{file:backup});
  await settingsPage.locator('#backup').click();await expect.poll(async()=>fs.stat(backup).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);
  const archive=new AdmZip(await fs.readFile(backup));expect(JSON.parse(archive.getEntry('petex-library.json').getData()).format).toBe('petex-library');
  await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
  await settingsPage.locator('#delete-pet').click();await expect(settingsPage.locator('#pet-count')).toHaveText('1');
  await application.evaluate(({dialog},{file})=>{dialog.showOpenDialog=async()=>({filePaths:[file],canceled:false});},{file:backup});
  await settingsPage.locator('#import-file').click();await expect(settingsPage.locator('h1')).toHaveText('Sunny test pet');
  await expect(settingsPage.locator('#pet-count')).toHaveText('2');
});

test('tray selection switches pets and the global shortcut respects manual visibility',async()=>{
  await application.evaluate(({Menu,globalShortcut})=>{
    const build=Menu.buildFromTemplate;Menu.buildFromTemplate=function(template){const menu=build.call(this,template);if(template[0]?.label?.startsWith('Petex ·'))globalThis.testTray=menu;return menu;};
    globalShortcut.register=(key,callback)=>{globalThis.testShortcut=callback;return true;};globalShortcut.unregister=()=>{};
  });
  await settingsPage.getByRole('button',{name:'Import from Codex'}).click();
  await expect(settingsPage.locator('h1')).toHaveText('Sunny test pet');
  await expect.poll(()=>application.evaluate(()=>!!globalThis.testTray)).toBe(true);
  await application.evaluate(()=>globalThis.testTray.items[1].submenu.items[0].click());
  await expect(settingsPage.locator('h1')).toHaveText('Miso');
  await settingsPage.locator('#shortcut').check({force:true});
  await expect(settingsPage.locator('#shortcut-description')).toContainText(process.platform==='darwin'?'⌘⇧P':'Ctrl+Shift+P');
  await application.evaluate(()=>globalThis.testShortcut());
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).settings.visible)).toBe(false);
  await application.evaluate(()=>globalThis.testShortcut());
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).petActive)).toBe(true);
});

test('paused and locked pets stop drawing; unlocking preserves the user show/hide choice',async()=>{
  await settingsPage.locator('#motion').uncheck({force:true});
  await expect(settingsPage.locator('#presence')).toHaveText('Animation paused');
  await petPage.evaluate(()=>{const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),clear=ctx.clearRect.bind(ctx);globalThis.draws=0;ctx.clearRect=(...args)=>{globalThis.draws++;clear(...args);};});
  await petPage.clock.install();await petPage.clock.runFor(1500);
  expect(await petPage.evaluate(()=>globalThis.draws)).toBe(0);
  await application.evaluate(({powerMonitor})=>powerMonitor.emit('lock-screen'));
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).petActive)).toBe(false);
  await expect(settingsPage.locator('#presence')).toHaveText('Paused while the screen is locked');
  await application.evaluate(({powerMonitor})=>powerMonitor.emit('unlock-screen'));
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).petActive)).toBe(true);
  await settingsPage.locator('#visible').uncheck({force:true});
  await application.evaluate(({powerMonitor})=>{powerMonitor.emit('lock-screen');powerMonitor.emit('unlock-screen');});
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).petActive)).toBe(false);
});

test('short automatic walks move within the display and stop immediately on hide',async()=>{
  const start=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').getBounds());
  await petPage.evaluate(()=>window.pedex.wander('running-left',1000));
  await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').getBounds().x)).toBeLessThan(start.x);
  await settingsPage.locator('#visible').uncheck({force:true});
  const hidden=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').getBounds());
  await petPage.clock.install();await petPage.clock.runFor(2000);
  expect(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').getBounds().x)).toBe(hidden.x);
  expect(await petPage.evaluate(async()=>{try{await window.pedex.wander('running-right',1000);return false;}catch{return true;}})).toBe(true);
});

test('hides for another fullscreen app and restores the pet after it closes',async()=>{
  test.setTimeout(60000);
  const idleState=await application.evaluate(({powerMonitor})=>powerMonitor.getSystemIdleState(60));
  let locked=idleState==='locked';
  if(process.platform==='darwin'){const {execFileSync}=require('node:child_process');locked=locked||execFileSync(path.join(__dirname,'../../app/native/fullscreen-darwin-'+process.arch),{input:'0 0 0 1 1\n',encoding:'utf8'}).trim()==='-1';}
  test.skip(locked,'Foreground window interactions require an unlocked desktop.');
  await expect(settingsPage.locator('#hideFullscreen')).toBeEnabled();
  await settingsPage.locator('#hideFullscreen').check({force:true});
  let external,child;
  if(process.platform==='darwin') {
    const {execFileSync,spawn}=require('node:child_process');
    const contents=path.join(root,'FullscreenFixture.app','Contents');await fs.mkdir(path.join(contents,'MacOS'),{recursive:true});
    await fs.writeFile(path.join(contents,'Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleIdentifier</key><string>ad.neko.petex.fullscreen-fixture</string><key>CFBundleName</key><string>Petex fullscreen fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
    const binary=path.join(contents,'MacOS','fixture');
    execFileSync('clang',['-fobjc-arc',path.join(__dirname,'../native/fullscreen-fixture.m'),'-framework','Cocoa','-o',binary]);
    child=spawn(binary,[],{stdio:'ignore'});
  }else {
    const fixture=path.join(root,'fullscreen-app.cjs');
    await fs.writeFile(fixture,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const win=new BrowserWindow({fullscreen:true,frame:false});win.loadURL('data:text/html,<title>Fullscreen fixture</title>');win.once('ready-to-show',()=>{win.show();win.focus();});});`);
    external=await electron.launch({executablePath:require('electron'),args:[fixture]});
  }
  try {
    await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).fullscreenHidden),{timeout:20000}).toBe(true);
    expect(await settingsPage.evaluate(async()=>(await window.pedex.getState()).settings.visible)).toBe(true);
    await expect.poll(()=>application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Petex pet').isVisible())).toBe(false);
  } finally {
    if(external)await external.close();
    if(child) {const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
  }
  await expect.poll(()=>settingsPage.evaluate(async()=>(await window.pedex.getState()).petActive),{timeout:10000}).toBe(true);
});
