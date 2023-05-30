import fs from 'node:fs/promises';
import cp from 'node:child_process';
import util from 'node:util';
import chalk from 'chalk';
import esbuild from 'esbuild';

const tests = import.meta.url.match(/^file:\/\/(.*)(?:\/[^\/]+){1}$/)[1] + '/test/';
for await (const i of await fs.opendir(tests, { recursive: true, bufferSize: 24 })) {
    if (i.isFile() && i.name.endsWith('.test.ts'))
        esbuild.build({
            entryPoints: [i.path],
            bundle: true,
            sourcemap: true,
            outdir: 'build/test',
            format: 'esm',
            external: ['#db', '#rel', '#repl'],
            platform: 'node',
            metafile: true,
        })
            .catch(err => console.error(err))
            .then(out => Object.keys(out.metafile.outputs).filter(i => i.endsWith('.js')))
            .then(out => cp.spawn('node', ['--enable-source-maps=true', out[0]], { stdio: 'inherit' }))
            .then(proc => new Promise(ok => proc.once('exit', code => ok(code))))
            .then(code => console.log(`${chalk.grey(`[${code == 0 ? chalk.green('PASS') : chalk.red('FAIL')}]`)} ${chalk.grey(i.path)}`));
}