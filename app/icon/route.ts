export function GET(request: Request) {
  return Response.redirect(new URL('/brand/dp-favicon.png', request.url), 307)
}
