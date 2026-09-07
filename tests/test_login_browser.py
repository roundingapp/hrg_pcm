"""Synthetic browser check; never signs in a real employee or sends an email."""
import functools
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright,expect

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*_):pass

class LoginBrowser(unittest.TestCase):
    def test_personal_email_login_and_error_at_mobile_width(self):
        handler=functools.partial(QuietHandler,directory=str(Path(__file__).resolve().parents[1]))
        server=ThreadingHTTPServer(('127.0.0.1',0),handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(headless=True)
                page=browser.new_page(viewport={'width':390,'height':844})
                calls=[]
                page.on('request',lambda r:calls.append(r.url))
                page.route('**/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword*',lambda route:route.fulfill(status=400,json={'error':{'code':400,'message':'INVALID_LOGIN_CREDENTIALS'}}))
                page.goto('http://127.0.0.1:%s/workspace.html' % server.server_port)
                button=page.get_by_role('button',name='Sign in',exact=True)
                button.wait_for()
                expect(button).to_be_enabled()
                self.assertIn('pay tracker',page.locator('#login').inner_text())
                self.assertNotIn('Tailscale',page.locator('body').inner_text())
                page.get_by_label('Email',exact=True).fill('synthetic@example.net')
                page.get_by_label('Password',exact=True).fill('synthetic-invalid-password')
                button.click()
                expect(page.locator('#login-status')).to_contain_text('Check your email')
                self.assertEqual(page.get_by_label('Password',exact=True).input_value(),'')
                self.assertFalse(any('firestore.googleapis.com' in u or 'graph.microsoft.com' in u or '/api/pcm' in u for u in calls))
                self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth'),390)
                browser.close()
        finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
