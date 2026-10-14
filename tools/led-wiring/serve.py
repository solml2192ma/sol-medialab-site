"""로컬 테스트용 서버: 브라우저 캐시를 끄고(no-store) 현재 폴더를 http://localhost:8765 로 제공한다.
(캐시 때문에 새로고침 때 옛 .js와 새 .js가 섞여 에러가 나는 것을 막기 위함)"""
import http.server
import socketserver


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", 8765), NoCache) as httpd:
    print("http://localhost:8765/index.html  (창을 닫으면 종료)")
    httpd.serve_forever()
