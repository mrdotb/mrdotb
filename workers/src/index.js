import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createSubscriber } from './request'

const app = new Hono()
app.use('*', cors())
app.get('/api', (c) => c.text('Mrdotb Blog API with cloudflare workers'))
app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404))

app.post('/api/subscribe', async c => {
  const params = await c.req.json()
  if (params.email === undefined || params.email === '') {
    return c.json({ error: 'Email is not defined', ok: false }, 422)
  }
  const request = await createSubscriber(params.email, c.env.GROUP_ID, c.env.MAILERLITE_API_TOKEN)
  if (![200, 201].includes(request.status)) {
    return c.json({ error: 'Could not subscribe', ok: false }, 422)
  }

  return c.json({ ok: true }, 201)
})

export default app
