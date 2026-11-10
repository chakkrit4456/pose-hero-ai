"""Startup gate, resource failures, nested loads and delayed 2D fallback."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'3.Game Control System')))
Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/Game%20Start.html'
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        for mode in ['normal','slow-3d','slow-2d','broken-logo']:
            page=browser.new_page();page.set_default_timeout(40000)
            if mode=='slow-3d':
                page.add_init_script('Object.defineProperty(window,"MRTeacher3D",{configurable:true,set(api){Object.defineProperty(window,"MRTeacher3D",{value:{create:async(...args)=>{await new Promise(r=>setTimeout(r,2200));return api.create(...args)}}})}})')
            if mode=='slow-2d':
                page.add_init_script('Object.defineProperty(window,"MRTeacher3D",{get:()=>null,set:()=>{}})')
                # Keep the image request pending until we have verified the gate.
                pending=[]
                page.route('**/office-fallback-wide.png',lambda route:pending.append(route))
            if mode=='broken-logo':page.route('**/pose-hero-logo-mascot-v3.png',lambda route:route.abort())
            page.goto(URL,wait_until='domcontentloaded')
            if mode in ['slow-3d','slow-2d']:
                assert page.locator('#app-loading').is_visible()
                assert page.locator('main').evaluate('(e)=>e.inert&&getComputedStyle(e).visibility==="hidden"')
                assert not page.locator('.lobby-fallback img').is_visible()
            if mode=='slow-2d':
                page.wait_for_function('!!document.querySelector(".lobby-fallback img")')
                page.wait_for_timeout(100)
                assert pending
                pending[0].fulfill(path=str(ROOT/'3.Game Control System/assets/office-fallback-wide.png'),content_type='image/png')
            if mode=='broken-logo':
                page.wait_for_function('document.documentElement.classList.contains("loading-error")')
                assert page.locator('#loading-retry').is_visible()
                assert page.locator('main').evaluate('(e)=>getComputedStyle(e).visibility==="hidden"')
            else:
                page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
                if mode=='slow-2d':assert page.locator('.lobby-fallback img').is_visible()
                else:assert page.locator('#home').evaluate('(e)=>e.classList.contains("lobby-webgl-ready")')
                if page.locator('#notice').is_visible():page.locator('#notice-ok').click()
                page.evaluate('window.finishA=MRLoading.begin("A");window.finishB=MRLoading.begin("B");finishA()')
                assert page.locator('#app-loading').is_visible()
                page.evaluate('finishB()');assert page.locator('#app-loading').is_hidden()
                page.locator('#m-start').click()
                page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
                assert page.locator('#setup').is_visible()
            print('PASS loading',mode,flush=True);page.close()
        browser.close()
finally:
    server.shutdown();server.server_close()
