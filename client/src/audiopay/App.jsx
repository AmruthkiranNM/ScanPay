import { useState } from 'react'
import { HomeScreen }     from './screens/HomeScreen.jsx'
import { ReceiverScreen } from './screens/ReceiverScreen.jsx'
import { SenderScreen }   from './screens/SenderScreen.jsx'
import { SuccessScreen }  from './screens/SuccessScreen.jsx'

/**
 * AudioPay — Root App
 * -------------------
 * Manages screen navigation. All state lives here so it's easy
 * to integrate into a larger app: just import the screens you
 * need and wire them into your own router.
 *
 * Screens:
 *   home     → HomeScreen
 *   receive  → ReceiverScreen
 *   send     → SenderScreen → (on success) → SuccessScreen
 */
export default function App() {
  const [screen, setScreen]   = useState('home')
  const [payment, setPayment] = useState(null)

  function goHome()    { setScreen('home'); setPayment(null) }
  function goSend()    { setScreen('send') }
  function goReceive() { setScreen('receive') }

  function handlePaymentSuccess(paymentData) {
    setPayment(paymentData)
    setScreen('success')
  }

  return (
    <>
      {screen === 'home' && (
        <HomeScreen
          onSend={goSend}
          onReceive={goReceive}
        />
      )}

      {screen === 'receive' && (
        <ReceiverScreen
          onBack={goHome}
          onPaymentReceived={(p) => console.log('[AudioPay] Received:', p)}
        />
      )}

      {screen === 'send' && (
        <SenderScreen
          onBack={goHome}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {screen === 'success' && payment && (
        <SuccessScreen
          payment={payment}
          onDone={goHome}
        />
      )}
    </>
  )
}
