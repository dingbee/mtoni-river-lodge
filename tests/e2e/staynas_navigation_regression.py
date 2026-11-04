#!/usr/bin/env python3
"""Critical public-navigation regression checks for StayNas."""
import os, subprocess, sys, time, urllib.error, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.getenv('STAYNAS_TEST_BASE', 'http://127.0.0.1:8080')
START_SERVER = os.getenv('STAYNAS_TEST_START_SERVER', '1') == '1'


def stop_and_report_server(process, reason):
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    output = ''
    if process:
        try:
            output = process.communicate(timeout=5)[0] or ''
        except subprocess.TimeoutExpired:
            output = '<preview output could not be collected>'
    raise RuntimeError(
        f'{reason}; preview_exit_code={process.returncode if process else "not-started"}; '
        f'preview_output_tail={output[-12000:]}'
    )


def wait_for_server(process):
    deadline = time.time() + 120
    while time.time() < deadline:
        if process and process.poll() is not None:
            stop_and_report_server(process, 'StayNas preview process exited before becoming ready')
        try:
            with urllib.request.urlopen(BASE_URL + '/rooms', timeout=3) as response:
                if response.status < 500:
                    return
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(2)
    stop_and_report_server(process, 'StayNas preview did not become ready at ' + BASE_URL)


def main():
    env = os.environ.copy()
    for k, v in {
        'VITE_SUPABASE_PROJECT_ID': 'ci-placeholder',
        'VITE_SUPABASE_PUBLISHABLE_KEY': 'ci-placeholder',
        'VITE_SUPABASE_URL': 'https://ci-placeholder.supabase.co',
        'SUPABASE_PROJECT_ID': 'ci-placeholder',
        'SUPABASE_PUBLISHABLE_KEY': 'ci-placeholder',
        'SUPABASE_URL': 'https://ci-placeholder.supabase.co',
    }.items():
        env.setdefault(k, v)
    server = subprocess.Popen(
        ['bun', 'run', 'preview', '--host', '127.0.0.1', '--port', '8080'],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    ) if START_SERVER else None
    try:
        wait_for_server(server)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
            errors = []
            console_errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
            response = page.goto(BASE_URL + '/rooms', wait_until='load')
            assert response and response.status < 400, 'Public rooms page did not load'
            menu_button = page.get_by_role('button', name='Open StayNas menu')
            menu_button.wait_for(state='visible')
            menu_button.click()
            try:
                expect(menu_button).to_have_attribute('aria-expanded', 'true', timeout=10000)
            except Exception:
                button_html = menu_button.evaluate('(el) => el.outerHTML') if menu_button.count() else 'MISSING'
                print('MENU_DIAGNOSTICS:', {
                    'url': page.url,
                    'ready_state': page.evaluate('document.readyState'),
                    'button': button_html,
                    'body_excerpt': page.locator('body').inner_text()[:1500],
                    'page_errors': errors,
                    'console_errors': console_errors,
                })
                raise
            drawer = page.locator('div.fixed.inset-0').filter(has=page.get_by_role('button', name='Close StayNas menu'))
            drawer.wait_for(state='visible', timeout=10000)
            assert menu_button.get_attribute('aria-expanded') == 'true', 'Mobile menu button did not enter expanded state'
            drawer.get_by_role('link', name='Rooms').wait_for(state='visible')
            drawer.get_by_role('link', name='Availability').wait_for(state='visible')
            staff = drawer.locator('a[href="/admin"]')
            staff.wait_for(state='visible')
            assert 'Staff & administration' in staff.inner_text(), 'Staff administration label missing'
            assert 'Sign in to StayNas' in staff.inner_text(), 'Staff helper text missing'
            assert drawer.get_by_text('Smarter hospitality. Brighter guest journeys.').is_visible(), 'StayNas AI panel missing'
            assert drawer.get_by_role('link').last.get_attribute('href') == '/admin', 'Staff access must remain final mobile navigation action'
            drawer.get_by_role('button', name='Close StayNas menu').click()
            drawer.wait_for(state='hidden', timeout=10000)
            assert menu_button.get_attribute('aria-expanded') == 'false', 'Mobile menu button did not collapse'
            assert not errors, 'Browser runtime errors: ' + '; '.join(errors)
            page.set_viewport_size({'width': 1280, 'height': 900})
            page.reload(wait_until='load')
            page.get_by_role('link', name='Book now').first.wait_for(state='visible')
            assert not errors, 'Browser runtime errors: ' + '; '.join(errors)
            browser.close()
        print('PASS: mobile navigation, StayNas AI, staff access, /admin target, drawer close, desktop booking CTA')
    finally:
        if server and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('FAIL:', exc, file=sys.stderr)
        raise
