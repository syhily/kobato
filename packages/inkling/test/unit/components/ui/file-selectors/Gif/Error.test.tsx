import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { Error } from '@/components/ui/file-selectors/Gif/Error'
import { ERROR_TYPE } from '@/utils/services/gif'

describe('Gif Error', () => {
  it('renders the common error message', () => {
    render(<Error error={ERROR_TYPE.COMMON} />)
    expect(screen.getByText(/Trouble reaching the GIF service/i)).toBeInTheDocument()
  })

  it('renders the invalid api key message without a dead documentation link', () => {
    render(<Error error={ERROR_TYPE.INVALID_API_KEY} />)
    expect(screen.getByText(/GIF API key is not valid/i)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders a generic error string', () => {
    render(<Error error="Something went wrong" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
