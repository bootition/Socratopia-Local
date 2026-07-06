import { useState, useEffect } from 'react'

function App(): React.ReactElement {
  const [version, setVersion] = useState<string>('')
  const [platform, setPlatform] = useState<string>('')

  useEffect(() => {
    window.socratopia.getPlatform().then(setPlatform).catch(() => setPlatform('unknown'))
    window.socratopia.getVersion().then(setVersion).catch(() => setVersion('unknown'))
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900 text-gray-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Socratopia-Local</h1>
        <p className="mt-4 text-gray-400">AI 苏格拉底式学习伴侣</p>
        <div className="mt-8 text-sm text-gray-500">
          <p>Platform: {platform || 'loading...'}</p>
          <p>Version: {version || 'loading...'}</p>
        </div>
      </div>
    </div>
  )
}

export default App
