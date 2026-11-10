"""Responsive WebGL + native touch scrolling. Python Playwright / Chromium required."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=(ROOT/'3.Game Control System'/'Game Start.html').as_uri()
(ROOT/'.qa').mkdir(exist_ok=True)

with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for width,height in [(390,844),(844,390),(768,1024),(1024,768),(1366,1024)]:
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=True,is_mobile=True,device_scale_factor=2)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL);page.locator('#notice-ok').click()
        page.wait_for_function('document.querySelector("#home").classList.contains("lobby-webgl-ready")')
        canvas=page.locator('.lobby-scene canvas')
        page.wait_for_timeout(100)
        phone=width<=760 or (height<=500 and width<=1000)
        assert canvas.get_attribute('data-layout')==('phone-background' if phone else 'touch-panel')
        bounds=canvas.bounding_box()
        assert abs(bounds['height']-height)<2 if phone else 159<=bounds['height']<=481
        if phone:
            assert abs(bounds['y'])<1
            assert page.locator('.lobby-scene').evaluate('(e)=>getComputedStyle(e).pointerEvents')=='none'
        assert abs(float(canvas.get_attribute('data-view-width'))-bounds['width'])<2
        # A genuine touch gesture starting ON the 3D canvas must scroll the page.
        session=context.new_cdp_session(page)
        x=width/2;y=min(height-30,bounds['y']+bounds['height']*.75)
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        for i in range(1,11):
            session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-i*12}]})
            page.wait_for_timeout(20)
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        page.wait_for_function('scrollY>20')
        page.wait_for_function('Number(document.querySelector(".lobby-scene canvas").dataset.progress)>.001')
        page.evaluate('scrollTo(0,document.documentElement.scrollHeight)')
        page.wait_for_function('document.querySelector(".lobby-scene canvas").dataset.progress==="1.00000"')
        assert canvas.get_attribute('data-angle')=='35.000'
        assert canvas.get_attribute('data-step')=='1.0000'
        assert canvas.bounding_box()['y']>=-1
        panel=page.locator('.lobby-scene').bounding_box()
        title=page.locator('.lobby-finale h3').bounding_box()
        if not phone:
            assert title['y']>=panel['y']+panel['height']-1, 'Sticky scene must not hide the final heading'
        else:
            assert page.locator('.lobby-finale .lobby-cta').evaluate('(e)=>{const r=e.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===e||e.contains(top)}'), 'Background must never intercept the UI'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.screenshot(path=str(ROOT/f'.qa/responsive-{width}x{height}.png'))
        page.evaluate('scrollTo(0,0)')
        page.wait_for_function('document.querySelector(".lobby-scene canvas").dataset.progress==="0.00000"')
        assert canvas.get_attribute('data-angle')=='-35.000'
        if width==390:
            page.set_viewport_size({'width':844,'height':390})
            page.wait_for_timeout(200)
            box=canvas.bounding_box()
            assert abs(int(canvas.get_attribute('data-view-height'))-box['height'])<2
            page.evaluate('scrollTo(0,document.documentElement.scrollHeight)')
            page.wait_for_function('document.querySelector(".lobby-scene canvas").dataset.progress==="1.00000"')
        page.locator('#m-start').click()
        assert page.locator('.lobby-scene').is_hidden()
        assert page.locator('#setup').is_visible()
        assert not errors,errors
        print('PASS',width,height,'touch swipe, camera, pose, reverse, visible panel, menu',flush=True)
        context.close()
    browser.close()
