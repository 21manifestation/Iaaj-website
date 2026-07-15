import http.server
import functools

directory = "/Users/itsallaboutjourney/Desktop/IAAJ/website"
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", 4300), handler)
httpd.serve_forever()
