import { SettingsGate } from './settings/SettingsGate'
import { ClassroomProvider } from './context/ClassroomContext'
import { AppShell } from './app-shell/AppShell'

/**
 * Application root.
 *
 * SettingsGate blocks the shell until a DeepSeek API key is configured
 * (first run), then the classroom provider + shell take over.
 */
function App(): React.ReactElement {
  return (
    <SettingsGate>
      <ClassroomProvider>
        <AppShell />
      </ClassroomProvider>
    </SettingsGate>
  )
}

export default App
