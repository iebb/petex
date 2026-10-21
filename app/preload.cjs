const {contextBridge, ipcRenderer, webUtils} = require('electron');
const invoke = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const subscribe = (channel, callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('pedex', {
  getState: () => invoke('state:get'),
  updateSettings: patch => invoke('settings:update', patch),
  importPet: kind => invoke('pets:import-dialog', kind),
  importDropped: files => invoke('pets:import-dropped', Array.from(files).map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  importBuiltins: () => invoke('pets:import-builtins'),
  discoverPets: () => invoke('pets:discover'),
  removePet: id => invoke('pets:remove', id),
  exportPets: kind => invoke('pets:export', kind),
  home: () => invoke('pet:home'),
  playAnimation: name => invoke('pet:play', name),
  openRepository: () => invoke('repository:open'),
  openPetsFolder: () => invoke('pets:open-folder'),
  closeSettings: () => invoke('settings:close'),
  menu: () => invoke('pet:menu'),
  pressStart: () => invoke('pet:press-start'),
  pressEnd: () => invoke('pet:press-end'),
  hit: value => invoke('pet:hit', value),
  wander: (name, duration) => invoke('pet:wander', name, duration),
  stroke: () => invoke('pet:stroke'),
  addCompanion: id => invoke('companions:add',id),
  removeCompanion: id => invoke('companions:remove',id),
  updateCompanion: (id,patch) => invoke('companions:update',id,patch),
  interact: () => invoke('pets:interact'),
  throwBall: () => invoke('toy:show'),
  toyPress: pressed => invoke('toy:press',pressed),
  chooseArea: () => invoke('area:open'),
  saveArea: area => invoke('area:save',area),
  closeArea: () => invoke('area:close'),
  saveLayout: name => invoke('layouts:save',name),
  restoreLayout: id => invoke('layouts:restore',id),
  removeLayout: id => invoke('layouts:remove',id),
  onState: callback => subscribe('state:changed', callback),
  onCursor: callback => subscribe('pet:cursor', callback),
  onAction: callback => subscribe('pet:action', callback),
  onStroke: callback => subscribe('pet:stroke',callback),
  onSocialStart: callback => subscribe('pet:social-start',callback),
  onSocialEnd: callback => subscribe('pet:social-end',callback),
});
