import React from 'react'
import { ThemeToggle } from '../theme-toggle'
const header = () => {
  return (
    <div className='p-4 h-5'>
    <div className='flex justify-end'>
         <ThemeToggle />
    </div>
        </div>
  )
}

export default header