import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourorg.coralhealth',
  appName: 'Coral Health Index',
  webDir: 'build',
  bundledWebRuntime: false,
  server: {
    // Uncomment during local dev with live reload (adjust host IP as needed)
    // url: 'http://10.0.2.2:5173',
    // cleartext: true
  }
};

export default config;
