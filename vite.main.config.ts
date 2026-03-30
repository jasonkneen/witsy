 
import type { ConfigEnv, UserConfig } from 'vite';
import { defineConfig, mergeConfig } from 'vite';
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from './vite.base.config';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv;
  const { forgeConfigSelf } = forgeEnv as any;
  const define = getBuildDefine(forgeEnv);
  const mainExternal = external.filter((dependency) => dependency !== 'pdfjs-dist');
  const config: UserConfig = {
    build: {
      lib: {
        entry: forgeConfigSelf.entry!,
        fileName: () => '[name].js',
        formats: ['cjs'],
      },
      sourcemap: true,
      rollupOptions: {
        external: mainExternal,
      },
    },
    test: {
      globals: true,
      environment: 'happy-dom',
    },
    plugins: [tsconfigPaths(), pluginHotRestart('restart')],
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ['module', 'jsnext:main', 'jsnext'],
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
