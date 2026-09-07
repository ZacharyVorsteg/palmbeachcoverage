const fs = require('node:fs');
const path = require('node:path');

function stagePublic(root = __dirname) {
  const output = path.join(root, 'public');
  const files = ['index.html', 'robots.txt', 'sitemap.xml', "cef0752662da2ce0eb360708188259db.txt"];
  function collect(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
      if (entry.isSymbolicLink()) throw new Error(`Refusing public symlink: ${dir}/${entry.name}`);
      if (entry.name.startsWith('_')) continue;
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) collect(name);
      else files.push(name);
    }
  }
  collect('blog');
  if (fs.existsSync(path.join(root, 'assets'))) collect('assets');
  for (const entry of fs.readdirSync(root)) {
    if (/^google[a-z0-9]+\.html$/.test(entry) || entry === 'BingSiteAuth.xml') files.push(entry);
  }
  for (const filename of files) {
    if (!fs.statSync(path.join(root, filename)).isFile() || fs.lstatSync(path.join(root, filename)).isSymbolicLink()) throw new Error(`Invalid public file: ${filename}`);
  }
  // This directory is disposable generated output, never the source checkout.
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Refusing symlink at public output');
  fs.rmSync(output, {recursive: true, force: true});
  fs.mkdirSync(output);
  for (const filename of files) {
    fs.mkdirSync(path.dirname(path.join(output, filename)), {recursive: true});
    fs.copyFileSync(path.join(root, filename), path.join(output, filename));
  }
  return files.length;
}

if (require.main === module) console.log(`Staged ${stagePublic()} public files`);
module.exports = { stagePublic };
