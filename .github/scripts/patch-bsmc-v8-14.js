/**
 * Applies the V8 14 / Electron 42 (ABI 146) build fix to a better-sqlite3-multiple-ciphers
 * source tree (the WiseLibs/better-sqlite3 #1475 fix, ported to the multiple-ciphers fork).
 *
 * V8 14 made v8::External::New()/Value() require an ExternalPointerTypeTag and made
 * ObjectTemplate::SetNativeDataProperty's 4th arg ambiguous for the literal 0. Without this,
 * the addon does not compile against Electron 42 / Node 24 headers.
 *
 * Usage: node patch-bsmc-v8-14.js <path-to-extracted-package-dir>
 * Idempotent; exits non-zero if any anchor is missing (source layout changed upstream).
 */
const fs = require('fs');
const path = require('path');

const pkg = process.argv[2];
if (!pkg) {
	console.error('Usage: node patch-bsmc-v8-14.js <package-dir>');
	process.exit(2);
}

let failed = false;

function replaceOnce(rel, oldStr, newStr, label) {
	const file = path.join(pkg, rel);
	let c = fs.readFileSync(file, 'utf8');
	if (c.includes(newStr) && !c.includes(oldStr)) {
		console.log(`SKIP (already patched) ${rel}: ${label}`);
		return;
	}
	if (!c.includes(oldStr)) {
		console.error(`MISSING ANCHOR ${rel}: ${label}`);
		failed = true;
		return;
	}
	fs.writeFileSync(file, c.replace(oldStr, newStr));
	console.log(`OK ${rel}: ${label}`);
}

// 1) better_sqlite3.cpp - route External::New through the gated macro
replaceOnce(
	'src/better_sqlite3.cpp',
	'v8::External::New(isolate, addon)',
	'EXTERNAL_NEW(isolate, addon)',
	'External::New -> EXTERNAL_NEW',
);

// 2) macros.cpp - define the ABI-gated macros and route OnlyAddon through EXTERNAL_VALUE
replaceOnce(
	'src/util/macros.cpp',
	'#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())',
	'#if defined(NODE_MODULE_VERSION) && NODE_MODULE_VERSION >= 146\n' +
		'#define EXTERNAL_NEW(isolate, value) v8::External::New((isolate), (value), 0)\n' +
		'#define EXTERNAL_VALUE(value) (value)->Value(0)\n' +
		'#else\n' +
		'#define EXTERNAL_NEW(isolate, value) v8::External::New((isolate), (value))\n' +
		'#define EXTERNAL_VALUE(value) (value)->Value()\n' +
		'#endif\n' +
		'#define OnlyAddon static_cast<Addon*>(EXTERNAL_VALUE(info.Data().As<v8::External>()))',
	'OnlyAddon + EXTERNAL_NEW/EXTERNAL_VALUE macros',
);

// 3) helpers.cpp - SetNativeDataProperty 4th arg 0 -> nullptr (disambiguates the overload).
//    Source ships CRLF; accept either line ending.
{
	const file = path.join(pkg, 'src/util/helpers.cpp');
	let c = fs.readFileSync(file, 'utf8');
	const crlf = '\t\tfunc,\r\n\t\t0,\r\n\t\tdata';
	const lf = '\t\tfunc,\n\t\t0,\n\t\tdata';
	if (c.includes('\t\tfunc,\r\n\t\tnullptr,') || c.includes('\t\tfunc,\n\t\tnullptr,')) {
		console.log('SKIP (already patched) src/util/helpers.cpp: SetNativeDataProperty');
	} else if (c.includes(crlf)) {
		fs.writeFileSync(file, c.replace(crlf, '\t\tfunc,\r\n\t\tnullptr,\r\n\t\tdata'));
		console.log('OK src/util/helpers.cpp: SetNativeDataProperty');
	} else if (c.includes(lf)) {
		fs.writeFileSync(file, c.replace(lf, '\t\tfunc,\n\t\tnullptr,\n\t\tdata'));
		console.log('OK src/util/helpers.cpp: SetNativeDataProperty');
	} else {
		console.error('MISSING ANCHOR src/util/helpers.cpp: SetNativeDataProperty');
		failed = true;
	}
}

// 4) Windows/MSVC only: V8 14's cppgc/heap.h uses __builtin_frame_address(0) (a Clang/GCC
//    builtin) unconditionally; MSVC lacks it. Shim it to _AddressOfReturnAddress() (the MSVC
//    stack-address intrinsic V8 itself uses elsewhere) before any V8 header is included. The
//    only compiled TU is src/better_sqlite3.cpp, so prepending there covers everything.
//    Guarded to MSVC-non-clang, so it is a no-op on the macOS/Linux (clang/gcc) builds.
{
	const file = path.join(pkg, 'src/better_sqlite3.cpp');
	const marker = '/* dbcode: MSVC __builtin_frame_address shim */';
	let c = fs.readFileSync(file, 'utf8');
	if (c.includes(marker)) {
		console.log('SKIP (already patched) src/better_sqlite3.cpp: MSVC frame-address shim');
	} else {
		const shim =
			marker +
			'\n#if defined(_MSC_VER) && !defined(__clang__)\n' +
			'#include <intrin.h>\n' +
			'#define __builtin_frame_address(x) _AddressOfReturnAddress()\n' +
			'#endif\n';
		fs.writeFileSync(file, shim + c);
		console.log('OK src/better_sqlite3.cpp: MSVC frame-address shim');
	}
}

if (failed) {
	process.exit(1);
}
