"""Startup gate, resource failures, nested loads and delayed 2D fallback."""
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
URL=f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        for mode in ['normal','mobile','slow-parser','slow-3d','slow-2d','broken-logo','broken-3d','broken-ai','optional-error','broken-fallback','broken-core']:
            page=browser.new_page(viewport={'width':390 if mode=='mobile' else 1280,'height':844},service_workers='block');page.set_default_timeout(45000)
            page.add_init_script('localStorage.setItem("move-relieve-settings",JSON.stringify({muted:true}));localStorage.setItem("pose-hero-lobby-motion","paused")')
            if mode=='slow-parser':
                page.add_init_script('const nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===30000?500:ms,...args)')
                delayed=[];page.route('**/core.js*',lambda route:delayed.append(route))
            if mode=='slow-3d':
                page.add_init_script('Object.defineProperty(window,"MRTeacher3D",{configurable:true,set(api){Object.defineProperty(window,"MRTeacher3D",{value:{create:async(...args)=>{await new Promise(r=>setTimeout(r,2200));return api.create(...args)}}})}})')
            if mode=='slow-2d':
                page.add_init_script('Object.defineProperty(window,"MRTeacher3D",{get:()=>null,set:()=>{}})')
                # Keep the image request pending until we have verified the gate.
                pending=[]
                page.route('**/office-fallback-wide.png',lambda route:pending.append(route))
            if mode=='broken-logo':page.route('**/pose-hero-logo-mascot-v3.png',lambda route:route.abort())
            if mode in ['broken-3d','broken-fallback']:page.route('**/teacher-data.js*',lambda route:route.abort())
            if mode=='broken-ai':page.route('**/model-data.js*',lambda route:route.abort())
            if mode=='optional-error':page.route('**/teacher3d.js*',lambda route:route.fulfill(content_type='application/javascript',body='throw new Error("optional renderer failed");'))
            if mode=='broken-fallback':page.route('**/office-fallback-*.png',lambda route:route.abort())
            if mode=='broken-core':page.route('**/core.js*',lambda route:route.abort())
            page.goto(URL,wait_until='commit' if mode=='slow-parser' else 'domcontentloaded')
            if mode=='slow-parser':
                page.wait_for_function('!!document.querySelector("script[src*=core]")')
                page.locator('#loading-retry').wait_for(state='visible')
                assert not page.locator('html').evaluate('(e)=>e.classList.contains("loading-error")')
                assert delayed
                delayed[0].fulfill(path=str(ROOT/'dist/ai/core.js'),content_type='application/javascript')
            if mode in ['slow-3d','slow-2d']:
                assert page.locator('#app-loading').is_visible()
                assert page.locator('main').evaluate('(e)=>e.inert&&getComputedStyle(e).visibility==="hidden"')
                assert not page.locator('.lobby-fallback img').is_visible()
            if mode=='slow-2d':
                page.wait_for_function('!!document.querySelector(".lobby-fallback img")')
                page.wait_for_timeout(100)
                assert pending
                pending[0].fulfill(path=str(ROOT/'3.Game Control System/assets/office-fallback-wide.png'),content_type='image/png')
            if mode=='broken-core':
                page.wait_for_function('document.documentElement.classList.contains("loading-error")')
                assert page.locator('#loading-retry').is_visible()
                assert page.locator('main').evaluate('(e)=>getComputedStyle(e).visibility==="hidden"')
                page.unroute('**/core.js*')
                page.locator('#loading-retry').click()
                page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
                assert 'mr-retry=' in page.url
                assert page.evaluate('JSON.parse(localStorage.getItem("move-relieve-settings")).muted')
            else:
                page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
                assert not page.locator('html').evaluate('(e)=>e.classList.contains("loading-error")')
                if mode in ['slow-2d','broken-3d','optional-error']:assert page.locator('.lobby-fallback img').is_visible()
                elif mode=='broken-fallback':assert page.locator('.lobby-scene canvas').get_attribute('data-fallback')=='plain'
                else:assert page.locator('#home').evaluate('(e)=>e.classList.contains("lobby-webgl-ready")')
                if page.locator('#notice').is_visible():page.locator('#notice-ok').click()
                page.evaluate('window.finishA=MRLoading.begin("A");window.finishB=MRLoading.begin("B");finishA()')
                assert page.locator('#app-loading').is_visible()
                page.evaluate('finishB()');assert page.locator('#app-loading').is_hidden()
                page.evaluate('MRLoading.begin("test abandoned task",50)')
                page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
                page.locator('#m-start').click()
                page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
                assert page.locator('#setup').is_visible()
            print('PASS loading',mode,flush=True);page.close()
        browser.close()
finally:
    server.shutdown();server.server_close()
