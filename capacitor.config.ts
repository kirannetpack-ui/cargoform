import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cargoform.logistics",
  appName: "CargoForm",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { allowMixedContent: false },
};

export default config;
