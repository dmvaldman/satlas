import { registerPlugin } from '@capacitor/core';

import type { GeofencingPlugin } from './definitions';

const Geofencing = registerPlugin<GeofencingPlugin>('Geofencing');

export * from './definitions';
export { Geofencing };

