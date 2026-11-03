#!/usr/bin/env python3
"""Critical public-navigation regression checks for StayNas."""
import os, subprocess, sys, time, urllib.error, urllib.request
from playwright.sync_api import sync_playwright
BASE_URL = os.getenv('STAYNAS_TEST_BASE', 'http://127.0.0.1:8080')
START_SERVER = os.getenv('STAYNAS_TEST_START_SERVER', '1') == '1'
def wait_for_server(process):
    deadline=time.time()+120
    while time.time()<deadline:
        if process and process.poll() is not None: raise RuntimeError('StayNas dev server exited before becoming ready')
        try:
            with urllib.request.urlopen(BASE_URL+'/rooms',timeout=3) as response:
                if response.status<500: return
        except (urllib.error.URLError,TimeoutError,OSError): time.sleep(2)
    raise TimeoutError('StayNas did not become ready at '+BASE_URL)
def main():
    env=os.environ.copy()
    for k,v in {'VITE_SUPABASE_PROJECT_ID':'ci-placeholder','VITE_SUPABASE_PUBLISHABLE_KEY':'ci-placeholder','VITE_SUPABASE_URL':'https://ci-placeholder.supabase.co','SUPABASE_PROJECT_ID':'ci-placeholder','SUPABASE_PUBLISHABLE_KEY':'ci-placeholder','SUPABASE_URL':'https://ci-placeholder.supabase.co'}.items(): env.setdefault(k,v)
    server=subprocess.Popen(['bun','run','dev','--','--host','127.0.0.1','--port','8080'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT) if START_SERVER else None
    try:
        wait_for_server(server)
        with sync_playwright() as p:
            browser=p.chromium.launch()
            page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
            errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
            response=page.goto(BASE_URL+'/rooms',wait_until='domcontentloaded')
            assert response and response.status<400,'Public rooms page did not load'
            page.get_by_role('button',name='Open StayNas menu').click()
            page.get_by_role('link',name='Rooms').wait_for(state='visible')
            page.get_by_role('link',name='Availability').wait_for(state='visible')
            staff=page.locator('a[href="/admin"]')
            staff.wait_for(state='visible')
            assert 'Staff & administration' in staff.inner_text(),'Staff administration label missing'
            assert 'Sign in to StayNas' in staff.inner_text(),'Staff helper text missing'
            assert page.get_by_text('Smarter hospitality. Brighter guest journeys.').is_visible(),'StayNas AI panel missing'
            assert page.locator('nav').get_by_role('link').last.get_attribute('href')=='/admin','Staff access must remain final mobile navigation action'
            page.get_by_role('button',name='Close StayNas menu').click()
            assert not staff.is_visible(),'Mobile drawer should close'
            assert not errors,'Browser runtime errors: '+'; '.join(errors)
            page.set_viewport_size({'width':1280,'height':900}); page.reload(wait_until='domcontentloaded')
            page.get_by_role('link',name='Book now').first.wait_for(state='visible')
            assert not errors,'Browser runtime errors: '+'; '.join(errors)
            browser.close()
        print('PASS: mobile navigation, StayNas AI, staff access, /admin target, drawer close, desktop booking CTA')
    finally:
        if server:
            server.terminate()
            try: server.wait(timeout=10)
            except subprocess.TimeoutExpired: server.kill()
if __name__=='__main__':
    try: main()
    except Exception as exc: print('FAIL:',exc,file=sys.stderr); raise