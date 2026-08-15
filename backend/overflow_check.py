import asyncio, json, subprocess, tempfile, time, urllib.request
import websockets

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
BASE = 'http://127.0.0.1:8000'
PORT = 9247

class CDP:
    def __init__(self, ws_url):
        self.ws_url = ws_url; self.msg_id = 0
    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=10_000_000)
    async def send(self, method, params=None):
        self.msg_id += 1
        await self.ws.send(json.dumps({'id': self.msg_id, 'method': method, 'params': params or {}}))
        while True:
            resp = json.loads(await self.ws.recv())
            if resp.get('id') == self.msg_id:
                if 'error' in resp: raise RuntimeError(resp['error'])
                return resp.get('result', {})
    async def evaljs(self, expr):
        r = await self.send('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
        return r.get('result', {}).get('value')
    async def navigate(self, url):
        await self.send('Page.navigate', {'url': url})
        await asyncio.sleep(3)
    async def set_viewport(self, w, h=1000):
        await self.send('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': 1, 'mobile': False})
        await asyncio.sleep(1)
    async def click_selector(self, css, index=0):
        return await self.evaljs(f"""
        (() => {{ const els = document.querySelectorAll({json.dumps(css)});
          if (!els.length) return 'NOT_FOUND'; els[{index}].click(); return 'CLICKED'; }})()""")
    async def type_selector(self, css, value, index=0):
        return await self.evaljs(f"""
        (() => {{ const els = document.querySelectorAll({json.dumps(css)});
          if (!els.length) return 'NOT_FOUND'; const el = els[{index}]; el.value = {json.dumps(value)};
          el.dispatchEvent(new Event('input', {{bubbles: true}})); return 'TYPED'; }})()""")

async def main():
    profile = tempfile.mkdtemp(prefix='ovf-')
    proc = subprocess.Popen([CHROME, f'--remote-debugging-port={PORT}', '--headless=new', '--disable-gpu', '--no-sandbox',
        '--user-data-dir=' + profile, 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(30):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json') as r:
                targets = json.loads(r.read()); break
        except Exception: time.sleep(0.5)
    page = next(t for t in targets if t.get('type') == 'page')
    cdp = CDP(page['webSocketDebuggerUrl'])
    await cdp.connect(); await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
    await cdp.navigate(BASE + '/accounts/login/')
    await cdp.evaljs("document.querySelector('input[value=admin]').click()")
    await cdp.type_selector('input[name=email]', 'admin')
    await cdp.type_selector('input[name=password]', 'admin1234')
    await cdp.click_selector('button[type=submit]')
    await asyncio.sleep(3)
    await cdp.set_viewport(420, 1100)
    await cdp.navigate(BASE + '/portal/admin/')
    await asyncio.sleep(2)
    print('doc width:', await cdp.evaljs('document.documentElement.scrollWidth'), 'client:', await cdp.evaljs('document.documentElement.clientWidth'))
    # find elements wider than viewport
    print(await cdp.evaljs("""
      [...document.querySelectorAll('*')].map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, cls: (el.className||'').toString().slice(0,50), w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
      }).filter(x => x.right > 420 + 2 || x.left < -2).slice(0, 12)
    """))
    proc.terminate()

asyncio.run(main())
