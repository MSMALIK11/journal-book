import React from 'react'
import { ThemeToggle } from '../theme-toggle'
import Persona from '../shared/persona'
const header = () => {
  return (
    <div className='p-4 h-5'>
    <div className='flex justify-end gap-4'>
         <ThemeToggle />
          <Persona  name='MR Shoaib' email="mohd.shoaib@gmail.com"  />

    </div>
        </div>
  )
}

export default header