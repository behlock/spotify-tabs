declare module '*.css' {
  const css: string;
  export default css;
}

interface Window {
  __spotifyTabs?:
    | import('./runtime.ts').TabRuntime
    | {
        status: 'waiting-for-router' | 'unsupported';
        dispose(): void;
      };
  __spotifyTabsDetachRequested?: boolean;
  Spicetify?: unknown;
}
