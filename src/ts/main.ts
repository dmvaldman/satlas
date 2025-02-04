import './map';
import { MapManager } from './map';

console.log('Initializing auth...');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing MapManager');
  new MapManager();
});