"""UI integration checks. Requires Python Playwright + Chromium (not needed to play).
Run after npm run build: python tests/browser-smoke.py
Writes screenshots to .qa/ and never uses a real camera or dance pad.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.qa'
OUT.mkdir(exist_ok=True)
URL = (ROOT / '3.Game Control System' / 'Game Start.html').as_uri()


def dismiss_notice(page):
    if page.locator('#notice').is_visible():
        page.locator('#notice-ok').click()


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width, height, theme in [(1440, 1000, 'light'), (390, 844, 'dark'), (768, 1024, 'light')]:
        context = browser.new_context(viewport={'width': width, 'height': height}, color_scheme=theme)
        page = context.new_page()
        page.set_default_timeout(10000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(URL)
        page.wait_for_timeout(300)
        dismiss_notice(page)
        assert page.locator('.brand-logo').evaluate('(e) => e.complete && e.naturalWidth > 0')
        assert page.locator('.mode-card').count() == 3
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.wait_for_function('document.querySelector("#home").classList.contains("lobby-webgl-ready")')
        page.locator('#lobby-motion').click()
        assert page.locator('#lobby-motion').get_attribute('aria-pressed') == 'true'
        paused_frame=page.locator('.lobby-scene canvas').get_attribute('data-progress')
        page.wait_for_timeout(150)
        assert page.locator('.lobby-scene canvas').get_attribute('data-progress') == paused_frame
        page.locator('#lobby-motion').click()
        page.evaluate('scrollTo(0,document.documentElement.scrollHeight)')
        page.wait_for_function('Number(document.querySelector(".lobby-scene canvas").dataset.progress)>.8')
        page.evaluate('scrollTo(0,0)')
        page.wait_for_function('Number(document.querySelector(".lobby-scene canvas").dataset.progress)<.001')
        page.screenshot(path=str(OUT / f'home-{width}.png'), full_page=True)
        page.locator('.help-launch').click()
        assert page.locator('dialog').is_visible()
        page.keyboard.press('Escape')
        page.locator('#m-start').click()
        assert not page.locator('.lobby-scene').is_visible()
        assert page.locator('.xc').count() == 17
        assert page.locator('#go').is_disabled()
        page.locator('.pose-preview').first.click()
        page.locator('#pose-end').click()
        page.screenshot(path=str(OUT / f'pose-{width}.png'))
        page.locator('#pose-choose').click()
        assert page.evaluate('st.queue.length') == 1
        assert page.locator('.pose-select').first.get_attribute('aria-pressed') == 'true'
        page.locator('#clr').click()
        assert page.evaluate('st.queue.length') == 0
        page.locator('.pose-select').first.click()
        page.locator('.xc .r').first.fill('1')
        page.locator('.xc .r').first.press('Tab')
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / f'selection-{width}.png'), full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.locator('#setup .back').click()
        page.locator('#m-set').click()
        assert page.locator('.settings-group').count() == 7
        assert page.locator('.settings-group .settings-group').count() == 0
        page.locator('#s-name').fill('UI test')
        page.locator('#s-save').click()
        assert page.evaluate('JSON.parse(localStorage.getItem(KEY)).playerName') == 'UI test'
        page.locator('#m-dance').click()
        before = page.evaluate('JSON.stringify(H.load(localStorage))')
        page.locator('#d-menu .practice-launch').click()
        for index in [1, 3, 5, 7]:
            page.locator('#practice-board button').nth(index).click()
        assert page.evaluate('dPhase') == 'menu'
        assert page.evaluate('JSON.stringify(H.load(localStorage))') == before
        page.keyboard.press('Escape')
        page.locator('#dance .back').click()
        page.locator('#m-fire').click()
        assert page.locator('#ff-menu').is_visible()
        page.locator('#ff-menu .practice-launch').click()
        assert page.locator('#practice-board button').first.is_disabled()
        page.keyboard.press('Escape')
        page.locator('#fire .back').click()
        page.locator('#m-stats').click()
        assert page.locator('#stats-empty').is_visible()
        page.locator('#stats .back').click()
        page.locator('#m-start').click()
        # Exercise the existing manual-count path without hardware, preserving rules.
        page.evaluate('cfg.autoCam=false;cfg.chainStep=false;cfg.demoSec=0;cfg.countdownSec=0;newState(true);renderList()')
        page.locator('.xc .r').first.fill('1')
        page.locator('.xc .r').first.press('Tab')
        page.locator('#go').click()
        page.wait_for_timeout(250)
        page.locator('#rep').click()
        page.wait_for_timeout(250)
        assert page.locator('#done').is_visible()
        assert page.evaluate('H.load(localStorage).length') == 1
        assert page.locator('#sharecv').is_visible()
        page.locator('#tohome').click()
        page.locator('#m-manage').click()
        page.locator('#mtabs [data-k="edit"]').click()
        page.locator('#mg-edit input[aria-label]').first.fill('Unsaved draft')
        assert page.evaluate('S2.editorDirty()')
        def cancel_draft(dialog):
            dialog.dismiss()
        page.once('dialog', cancel_draft)
        page.locator('#manage .back').click()
        assert page.locator('#manage').is_visible()
        page.once('dialog', lambda dialog: dialog.accept())
        page.locator('#manage .back').click()
        assert page.locator('#home').is_visible()
        page.locator('#m-set').click()
        with page.expect_download() as download:
            page.locator('#s-bk').click()
        assert download.value.suggested_filename.endswith('.json')
        page.locator('#s-bk-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'not-json'})
        assert page.locator('#s-bk-msg').text_content()
        page.locator('#settings .back').click()
        page.locator('#m-start').click()
        page.evaluate('() => {aiCam.prepareModel=async()=>{throw new Error("Camera unavailable in test")};}')
        page.locator('#cam-setup').click()
        page.wait_for_function('!document.getElementById("cs-toggle").disabled')
        assert page.locator('#cs-msg').text_content()
        assert page.locator('#cs-toggle').is_enabled()
        assert not errors, errors
        print(f'PASS {width}x{height} {theme}: navigation, tutorial, selection, settings, rehearsal, results')
        context.close()
    context=browser.new_context(reduced_motion='reduce')
    page=context.new_page();page.goto(URL);dismiss_notice(page);page.locator('#m-start').click()
    page.locator('.pose-preview').first.click()
    assert page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches')
    page.keyboard.press('Escape')
    assert not page.locator('dialog').is_visible()
    page.locator('#setup .back').click()
    page.wait_for_function('document.querySelector("#home").classList.contains("lobby-webgl-ready")')
    assert page.locator('#lobby-motion').is_disabled()
    still=page.locator('.lobby-scene canvas').evaluate('(c)=>c.toDataURL()')
    page.wait_for_timeout(150)
    assert page.locator('.lobby-scene canvas').evaluate('(c)=>c.toDataURL()') == still
    print('PASS reduced motion and Escape')
    browser.close()
