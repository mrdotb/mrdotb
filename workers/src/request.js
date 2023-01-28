export const createSubscriber = (email, groupId, token) => {
  const url = `https://api.mailerlite.com/api/v2/groups/${groupId}/subscribers`
  const body = JSON.stringify({ email, type: 'unconfirmed' })
  const options = {
    body,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MailerLite-Apikey': token
    }
  }
  return fetch(url, options)
}
