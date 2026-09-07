"""Exercise loading failures in real browser engines using synthetic API responses."""
import functools,json,threading,unittest
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
HTML='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/shared/owner.css"><link rel="stylesheet" href="/shared/pcm.css"><main id="content"></main><dialog id="detail"></dialog><script type="module">
import {createPCM} from '/shared/pcm.js';
window.calls=0;window.mode='reject';window.pending=[];
const response={rows:[],counts:{candidate:0,review:0,outreach:0,enrolled:0,paused:0,declined:0},enrolled:0,billed:0,payment_received:0,total:0,page:0};
const api=()=>{window.calls++;if(window.mode==='reject')return Promise.reject(Error('Could not load patients.'));if(window.mode==='hang')return new Promise((resolve,reject)=>window.pending.push({resolve,reject}));return Promise.resolve(response);};
window.pcm=createPCM({api,openDialog:()=>{},dialogVersion:()=>0,toast:()=>{},showFinancials:false,loadTimeoutMs:150});
window.start=mode=>{window.mode=mode;document.querySelector('#content').innerHTML=pcm.render();window.finished=false;Promise.resolve(pcm.wire()).then(()=>window.finished=true);};window.ready=true;
</script>'''
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=='/loading-check':
   raw=HTML.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
  else:super().do_GET()
class LoadingBrowser(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)));threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.pw=sync_playwright().start()
 @classmethod
 def tearDownClass(cls):cls.pw.stop();cls.server.shutdown();cls.server.server_close()
 def each_browser(self,check):
  for name in ['chromium','webkit']:
   with self.subTest(browser=name):
    browser=getattr(self.pw,name).launch(**({'channel':'chrome','headless':True} if name=='chromium' else {'headless':True}));page=browser.new_page(viewport={'width':390,'height':844})
    try:page.goto('http://127.0.0.1:%s/loading-check'%self.server.server_port);page.wait_for_function('window.ready');check(page)
    finally:browser.close()
 def test_rejected_load_replaces_spinner_and_retry_succeeds(self):
  def check(page):
   page.evaluate("start('reject')")
   expect(page.locator('#pcm-summary')).not_to_contain_text('Loading',timeout=1500)
   expect(page.locator('#pcm-summary')).to_contain_text('Could not load patients.')
   page.evaluate("window.mode='ok'");page.get_by_role('button',name='Retry loading').click()
   expect(page.locator('#pcm-table')).to_contain_text('No patients match')
  self.each_browser(check)
 def test_stalled_load_times_out_and_initial_completion_is_awaitable(self):
  def check(page):
   page.evaluate("start('hang')");self.assertFalse(page.evaluate('window.finished'))
   expect(page.get_by_role('button',name='Retry loading')).to_be_visible(timeout=1500)
   expect(page.locator('#pcm-summary')).to_contain_text('took too long')
   page.wait_for_function('window.finished');self.assertLess(page.locator('#pcm-summary').bounding_box()['height'],200)
  self.each_browser(check)
 def test_late_error_cannot_replace_a_newer_success(self):
  def check(page):
   page.evaluate("start('hang');window.mode='ok';pcm.refresh()")
   expect(page.locator('#pcm-table')).to_contain_text('No patients match')
   page.evaluate("window.pending[0].reject(Error('Old request failed'))")
   expect(page.locator('#pcm-table')).not_to_contain_text('Old request failed')
   expect(page.locator('#pcm-table')).to_contain_text('No patients match')
  self.each_browser(check)
if __name__=='__main__':unittest.main()
