// frontend/rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  // Main entry point for the application
  input: 'src/index.ts',

  // Output configuration
  output: {
    // This explicitly creates the single file the browser expects
    file: 'dist/index.js',

    // Output format suitable for direct browser use
    format: 'iife',
    name: 'AppBundle',
    sourcemap: true
  },

  // Plugins to handle TypeScript, node modules, and CommonJS imports
  plugins: [
    // 1. nodeResolve: Allows Rollup to find modules in node_modules (e.g., qrcode)
    nodeResolve({
      browser: true
    }),
    // 2. commonjs: Converts CommonJS modules (like Qrcode) to standard ES modules
    commonjs(),
    // 3. typescript: Compiles your TypeScript files
    typescript({
      tsconfig: './tsconfig.json',
	  compilerOptions: {
        module: "ESNext"
	  }
    }),
  ]
};
