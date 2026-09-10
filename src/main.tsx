import ReactDOM from 'react-dom/client'
import { Workbench } from './components/Workbench'
import { AtlasWorkbench } from './components/AtlasWorkbench'
import './styles.css'
import './workbench.css'
import './atlas.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  new URLSearchParams(window.location.search).get('view') === 'legacy' ? <Workbench /> : <AtlasWorkbench />,
)
