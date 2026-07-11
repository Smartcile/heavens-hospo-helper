import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    role: string
    venueId: string
    defaultVenueId: string | undefined
  }

  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: string
      venueId: string
      defaultVenueId: string | undefined
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    venueId: string
    defaultVenueId: string | undefined
  }
}
