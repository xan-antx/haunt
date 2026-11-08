import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useLanguage } from './hooks/useLanguage';
import { AutopayPage } from './pages/AutopayPage';
import { BillPage } from './pages/BillPage';
import { ConfirmationPage } from './pages/ConfirmationPage';

function AppRoutes() {
  // Detect ?lang= and keep <html lang> in sync for every route.
  useLanguage();
  return (
    <Routes>
      <Route path="/" element={<BillPage />} />
      <Route path="/autopay" element={<AutopayPage />} />
      <Route path="/confirmation" element={<ConfirmationPage />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
