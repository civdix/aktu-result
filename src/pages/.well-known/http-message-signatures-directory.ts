import type { APIRoute } from 'astro';

export const prerender = false;

const jwks = {
  keys: [
    {
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
      kid: 'akturesult-bot-sig-2026',
      n: 'uXz5jG7nF9kL2mR8vP1wQ4tY7sB0aE3dG6hJ9kL2mR5vP8wQ1tY4sB7aE0dG3hJ6kL9mR2vP5wQ8tY1sB4aE7dG0hJ3kL6mR9vP2wQ5tY8sB1aE4dG7hJ0kL3mR6vP9wQ2tY5sB8aE1dG4hJ7kL0mR3vP6wQ9tY2sB5aE8dG1hJ4kL7mR0vP3wQ6tY9sB2aE5dG8hJ1kL4mR7vP0wQ3tY6sB9aE2dG5hJ8kL1mR4vP7wQ0tY3sB6aE9dG2hJ5',
      e: 'AQAB'
    }
  ]
};

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(jwks, null, 2), { status: 200, headers });
};

export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200, headers });
};
