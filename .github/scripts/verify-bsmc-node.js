/**
 * Runtime verification for a built better-sqlite3-multiple-ciphers binary, run UNDER NODE
 * (so process.versions.modules reflects the Node ABI, e.g. 115 for Node 20). Headless twin of
 * verify-bsmc.js, which is Electron-only.
 *
 * Usage: node verify-bsmc-node.js <path-to-package-dir>
 * Prints "VERIFY_OK {...}" and exits 0 on success, "VERIFY_FAIL ..." and exits 1 otherwise.
 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

let encFile;
try {
	const pkgDir = process.argv[2] || process.cwd();
	// require(pkgDir) mis-resolves to <repo>/package.json (Node's LOAD_AS_FILE matches the
	// sibling package.json before the package/ directory), so resolve via the package manifest.
	const pkgJson = require(path.join(pkgDir, 'package.json'));
	const entry = require(path.join(pkgDir, pkgJson.main || 'lib/index.js'));
	const Database = typeof entry === 'function' ? entry : entry && (entry.default || entry.Database);
	if (typeof Database !== 'function') {
		throw new Error(`export is not a constructor: typeof=${typeof entry} path=${pkgDir}`);
	}

	const db = new Database(':memory:');
	db.exec('CREATE TABLE t(a INTEGER, b TEXT)');
	db.prepare('INSERT INTO t VALUES (?, ?)').run(42, 'ok');
	const row = db.prepare('SELECT a, b FROM t WHERE a = ?').get(42);
	const ver = db.prepare('SELECT sqlite_version() AS v').get();
	db.close();

	// exercise the multiple-ciphers encryption path on a real file
	encFile = path.join(os.tmpdir(), `verify_bsmc_${process.pid}.db`);
	const enc = new Database(encFile);
	enc.pragma("cipher='sqlcipher'");
	enc.pragma("key='testkey'");
	enc.exec('CREATE TABLE s(x)');
	enc.prepare('INSERT INTO s VALUES (7)').run();
	const encRow = enc.prepare('SELECT x FROM s').get();
	enc.close();

	if (row.a !== 42 || row.b !== 'ok' || encRow.x !== 7) {
		throw new Error(`unexpected result: ${JSON.stringify({ row, encRow })}`);
	}
	console.log(
		'VERIFY_OK ' +
			JSON.stringify({
				row,
				sqlite: ver.v,
				abi: process.versions.modules,
				node: process.versions.node,
				encRow,
			}),
	);
	process.exitCode = 0;
} catch (e) {
	console.log('VERIFY_FAIL ' + ((e && e.stack) || e));
	process.exitCode = 1;
} finally {
	if (encFile && fs.existsSync(encFile)) {
		fs.unlinkSync(encFile);
	}
}
