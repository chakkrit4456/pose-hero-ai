"""Idle dance must advance without scroll, but stop while paused/off-page/reduced."""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL=(Path(__file__).resolve().parents[1]/'3.Game Control System'/'Game Start.html').as_uri()
with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for width in [1440,390]:
        page=browser.new_page(viewport={'width':width,'height':900})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL);page.locator('#notice-ok').click()
        page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
        canvas=page.locator('.lobby-scene canvas')
        initial=canvas.get_attribute('data-dance-time')
        page.wait_for_function('(t)=>document.querySelector(".lobby-scene canvas").dataset.danceTime!==t',arg=initial)
        assert canvas.get_attribute('data-angle')=='-35.000'
        page.locator('#lobby-motion').click()
        frozen=canvas.get_attribute('data-dance-time');page.wait_for_timeout(250)
        assert canvas.get_attribute('data-dance-time')==frozen
        page.locator('#lobby-motion').click()
        page.wait_for_function('(t)=>document.querySelector(".lobby-scene canvas").dataset.danceTime!==t',arg=frozen)
        page.locator('#m-level').click()
        frozen=canvas.get_attribute('data-dance-time');page.wait_for_timeout(250)
        assert canvas.get_attribute('data-dance-time')==frozen
        page.locator('#level .back').click()
        page.wait_for_function('(t)=>document.querySelector(".lobby-scene canvas").dataset.danceTime!==t',arg=frozen)
        page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(100)
        frozen=canvas.get_attribute('data-dance-time');page.wait_for_timeout(250)
        assert canvas.get_attribute('data-dance-time')==frozen
        assert not errors,errors
        print('PASS',width,'idle dance, stable camera, pause/resume, page exit, reduced motion',flush=True)
        page.close()
    browser.close()
