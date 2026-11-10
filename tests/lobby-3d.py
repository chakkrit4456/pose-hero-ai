"""Scroll integration for the real WebGL lobby. Run after npm run build."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=(ROOT/'3.Game Control System'/'Game Start.html').as_uri()
(ROOT/'.qa').mkdir(exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for width in [1440,390]:
        page=browser.new_page(viewport={'width':width,'height':960})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL)
        page.locator('#notice-ok').click()
        page.wait_for_function('document.querySelector("#home").classList.contains("lobby-webgl-ready")')
        canvas=page.locator('.lobby-scene canvas')
        start=canvas.screenshot()
        initial=float(canvas.get_attribute('data-distance'))
        assert int(canvas.get_attribute('data-office-props'))>100
        assert canvas.get_attribute('data-foreground-clear')=='true'
        assert canvas.get_attribute('data-step')=='0.0000'
        assert float(canvas.get_attribute('data-angle')) == -35
        page.screenshot(path=str(ROOT/f'.qa/3d-start-{width}.png'))
        page.evaluate('scrollTo(0,(document.documentElement.scrollHeight-innerHeight)/2)')
        page.wait_for_function('Math.abs(Number(document.querySelector(".lobby-scene canvas").dataset.progress)-.5)<.002')
        assert float(canvas.get_attribute('data-distance'))<initial-.8
        assert abs(float(canvas.get_attribute('data-angle')))<1
        page.evaluate('scrollTo(0,document.documentElement.scrollHeight)')
        page.wait_for_function('document.querySelector(".lobby-scene canvas").dataset.progress==="1.00000"')
        assert float(canvas.get_attribute('data-angle'))==35
        assert canvas.get_attribute('data-foreground-clear')=='true'
        assert canvas.get_attribute('data-step')=='1.0000'
        assert canvas.screenshot()!=start
        page.screenshot(path=str(ROOT/f'.qa/3d-end-{width}.png'))
        page.evaluate('scrollTo(0,0)')
        page.wait_for_function('document.querySelector(".lobby-scene canvas").dataset.progress==="0.00000"')
        assert float(canvas.get_attribute('data-angle'))==-35
        assert float(canvas.get_attribute('data-distance'))==initial
        assert canvas.screenshot()==start, 'Initial scene and pose must be restored exactly'
        page.locator('#lobby-motion').click()
        page.evaluate('scrollTo(0,document.documentElement.scrollHeight)')
        page.wait_for_timeout(200)
        assert canvas.get_attribute('data-progress')=='0.00000'
        page.locator('#lobby-motion').evaluate('(e)=>e.click()')
        page.wait_for_function('Number(document.querySelector(".lobby-scene canvas").dataset.progress)>.8')
        page.locator('#m-start').click()
        assert page.locator('.lobby-scene').is_hidden()
        assert not errors, errors
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.close()
        print('PASS',width,'WebGL, left/front/right, dolly, pose reversal, pause, navigation',flush=True)
    page=browser.new_page(reduced_motion='reduce')
    page.goto(URL);page.locator('#notice-ok').click()
    page.wait_for_function('document.querySelector("#home").classList.contains("lobby-webgl-ready")')
    page.evaluate('scrollTo(0,document.documentElement.scrollHeight)');page.wait_for_timeout(200)
    assert page.locator('#lobby-motion').is_disabled()
    assert page.locator('.lobby-scene canvas').get_attribute('data-progress')=='0.00000'
    page.close()
    # Model failure must leave a usable menu and a static mascot fallback.
    page=browser.new_page()
    page.add_init_script('Object.defineProperty(window,"MRTeacher3D",{get:()=>null,set:()=>{}})')
    page.goto(URL);page.locator('#notice-ok').click()
    assert page.locator('#lobby-motion').is_disabled()
    assert page.locator('#lobby-character #mascot').is_visible()
    page.locator('#m-start').click();assert page.locator('#setup').is_visible()
    browser.close()
    print('PASS reduced motion and model failure fallback',flush=True)
