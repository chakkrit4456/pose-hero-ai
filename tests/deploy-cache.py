"""Exercise the built release and real service worker online, stale-cache and offline."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        context=browser.new_context()
        page=context.new_page();page.set_default_timeout(60000)
        page.add_init_script('localStorage.setItem("move-relieve-settings",JSON.stringify({muted:true}));localStorage.setItem("pose-hero-lobby-motion","paused")')
        page.goto(url,wait_until='domcontentloaded')
        page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
        page.wait_for_function('!!navigator.serviceWorker.controller')
        assert page.evaluate('''()=>[...document.scripts].every(s=>s.getAttribute('data-cfasync')==='false')''')
        assert page.evaluate('''()=>[...document.scripts].filter(s=>s.src).every(s=>new URL(s.src).searchParams.has('v'))''')
        # Poison the current cache: a network navigation must still load the real release.
        page.evaluate('''async()=>{const keys=await caches.keys();const c=await caches.open(keys.find(k=>k.startsWith('mr-')));await c.put('./',new Response('STALE RELEASE',{headers:{'Content-Type':'text/html'}}));}''')
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
        assert page.locator('#m-start').is_visible()
        print('PASS deployed URLs pinned, Cloudflare script ordering, stale HTML cache bypassed',flush=True)
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
        page.locator('#notice-ok').click()
        page.locator('#m-start').click()
        page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
        assert page.locator('#setup').is_visible()
        missing=page.evaluate('''async()=>{try{const r=await fetch('missing-script.js');return await r.text();}catch(e){return 'NETWORK_ERROR';}}''')
        assert missing=='NETWORK_ERROR',missing[:100]
        print('PASS offline release boots; missing JavaScript never receives HTML fallback',flush=True)
        context.close();browser.close()
finally:
    server.shutdown();server.server_close()
