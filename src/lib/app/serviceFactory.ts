import { AppMode } from './appMode';
import { appServices } from './appServices';

export const ServiceFactory = {
  getServices(mode?: AppMode) {
    // If a specific mode is passed, we can customize, but by default return the configured appServices
    return appServices;
  }
};
