import React, {useLayoutEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {useDelayRender, VERSION} from 'remotion';

let failing;
const expose = (controls) => { failing = controls; };

function Composition({label, ready}) {
  const controls = useDelayRender();
  useLayoutEffect(() => { ready?.(controls); }, [ready, controls]);
  return <div className="tile">{label}</div>;
}

function errorFallback({error}) {
  return <div className="tile" role="alert">{error.message}</div>;
}

function Demo() {
  const [failed, setFailed] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const props = {
    component: Composition, compositionWidth: 360, compositionHeight: 135,
    durationInFrames: 30, fps: 30, acknowledgeRemotionLicense: true,
    errorFallback, style: {width: 360, height: 135},
  };
  const trigger = async () => {
    const handle = failing.delayRender('Player A: pending async render task');
    try {
      await Promise.reject(new Error('Player A: async effect failed')).catch(failing.cancelRender);
    } catch {
      setFailed(true);
      setGlobalError(window.remotion_cancelledErrorObject?.message ?? '');
    } finally {
      failing.continueRender(handle);
    }
  };
  return <>
    <h1>Async rendering error escapes Player A</h1>
    <p>{'Published Remotion ' + VERSION}</p>
    <div className="players">
      <div className="panel"><h2>Player A</h2><Player {...props} inputProps={{label: 'Composition A', ready: expose}} /></div>
      <div className="panel"><h2>Player B</h2><Player {...props} inputProps={{label: 'Healthy composition B'}} /></div>
    </div>
    <p><button onClick={trigger} disabled={failed}>Reject Player A’s pending task</button></p>
    <pre role="status">{failed ? 'Async task: rejected\nGlobal cancellation: ' + (globalError || 'none') : 'Async task: ready to trigger\nGlobal cancellation: none'}</pre>
    <p>Expected after rejection: Player A shows its error fallback. Player B stays mounted.</p>
  </>;
}
createRoot(document.getElementById('root')).render(<Demo />);
