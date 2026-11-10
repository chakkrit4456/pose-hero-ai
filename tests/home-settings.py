"""Home ambience controls, independent game gain, and 2D/3D preference."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=(ROOT/'3.Game Control System'/'Game Start.html').as_uri()
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page();page.set_default_timeout(40000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('localStorage.setItem("move-relieve-settings",JSON.stringify({lobbyBackground2d:true,volume:60,lobbyMusicEnabled:true,lobbyMusicVolume:25,gameMusicVolume:60}))')
    page.goto(URL)
    page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
    page.locator('#notice-ok').click()
    page.wait_for_function('window.MRLobbyAudio && !MRLobbyAudio.audio.paused')
    assert abs(page.evaluate('MRLobbyAudio.audio.volume')-.15)<.001
    assert page.locator('#lobby-music-toggle').text_content()==''
    assert page.locator('#lobby-music-toggle svg').count()==1
    assert page.locator('#lobby-music-toggle').get_attribute('aria-label')
    first=page.evaluate('MRLobbyAudio.current')
    page.evaluate('MRLobbyAudio.audio.dispatchEvent(new Event("ended"))')
    page.wait_for_function('(first)=>MRLobbyAudio.current!==first',arg=first)
    page.locator('#lobby-music-toggle').click()
    assert page.evaluate('MRLobbyAudio.audio.paused && cfg.lobbyMusicEnabled===false')
    page.locator('#lobby-music-toggle').click()
    page.wait_for_function('!document.documentElement.classList.contains("app-loading") && !MRLobbyAudio.audio.paused')
    page.locator('#lobby-music-volume').fill('40')
    assert abs(page.evaluate('MRLobbyAudio.audio.volume')-.24)<.001
    assert page.evaluate('cfg.gameMusicVolume')==60
    page.locator('#m-set').click()
    assert page.evaluate('MRLobbyAudio.audio.paused')
    assert page.locator('#s-lobby-2d').is_checked()
    page.locator('#s-game-vol').fill('80')
    page.locator('#s-save').click()
    page.wait_for_function('!document.documentElement.classList.contains("app-loading")')
    assert page.evaluate('cfg.gameMusicVolume')==80
    assert page.evaluate('cfg.lobbyMusicVolume')==40
    assert abs(page.evaluate('MRLobbyAudio.audio.volume')-.24)<.001
    page.locator('#m-set').click()
    page.locator('#s-lobby-2d').uncheck()
    page.locator('#s-save').click()
    page.wait_for_function('!document.documentElement.classList.contains("app-loading") && document.querySelector("#home").classList.contains("lobby-webgl-ready")')
    assert page.locator('.lobby-fallback').count()==0
    page.locator('#m-set').click()
    page.locator('#s-lobby-2d').check()
    page.locator('#s-save').click()
    page.wait_for_function('!document.documentElement.classList.contains("app-loading") && document.querySelector("#home").classList.contains("lobby-2d-ready")')
    assert page.locator('.lobby-fallback img').is_visible()
    assert page.evaluate('JSON.parse(localStorage.getItem(KEY)).lobbyBackground2d')
    assert not errors,errors
    print('PASS icon-only audio, random tracks, separate gains, page isolation, 2D/3D switching and saved preference')
    browser.close()
