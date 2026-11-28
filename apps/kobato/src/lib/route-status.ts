export function notFound(message = 'Not Found'): never {
  throw new Response(message, { status: 404 })
}
