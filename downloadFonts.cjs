const fs = require('fs');
const path = require('path');

const fonts = [
  'Cinzel', 'Cormorant Garamond', 'Playfair Display', 'Great Vibes', 
  'Dancing Script', 'Montserrat', 'EB Garamond', 'Libre Baskerville', 
  'Raleway', 'Lato'
];

const dir = path.join(__dirname, 'server-fonts');

async function download() {
  for (const name of fonts) {
    if (fs.existsSync(path.join(dir, `${name.replace(/ /g, '')}.ttf`))) {
       console.log(`${name} already exists.`);
       continue;
    }
    console.log(`Resolving ${name}...`);
    try {
      const fetch = (await import('node-fetch')).default || global.fetch;
      const cssUrl = `https://fonts.googleapis.com/css?family=${name.replace(/ /g, '+')}`;
      const cssRes = await fetch(cssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPad; U; CPU OS 3_2 like Mac OS X; en-us) AppleWebKit/531.21.10 (KHTML, like Gecko) Version/4.0.4 Mobile/7B334b Safari/531.21.10'
        }
      });
      const css = await cssRes.text();
      // Extract the url(...) from the CSS snippet
      const match = css.match(/url\((https:\/\/[^)]+)\)/i);
      if (match && match[1]) {
        let ttfUrl = match[1];
        if (ttfUrl.includes("'")) ttfUrl = ttfUrl.replace(/'/g, '');
        if (ttfUrl.includes('"')) ttfUrl = ttfUrl.replace(/"/g, '');
        console.log(`Downloading TTF from ${ttfUrl}`);
        const ttfRes = await fetch(ttfUrl);
        const buffer = await ttfRes.arrayBuffer();
        fs.writeFileSync(path.join(dir, `${name.replace(/ /g, '')}.ttf`), Buffer.from(buffer));
        console.log(`Saved ${name}.ttf`);
      } else {
         console.log(`Could not find TTF url in CSS for ${name}. CSS:`, css);
      }
    } catch (e) {
      console.error(`Failed to download ${name}:`, e.message);
    }
  }
}

download();
