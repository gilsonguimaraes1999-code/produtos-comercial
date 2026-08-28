import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n';
import { Login } from './Login';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  activateAccount: vi.fn(),
  loginAsViewer: vi.fn(),
}));

const accessRequests = vi.hoisted(() => ({
  cities: vi.fn(),
  create: vi.fn(),
  status: vi.fn(),
}));

vi.mock('../auth', () => ({
  useAuth: () => ({
    ...auth,
    activationEnabled: true,
  }),
}));

vi.mock('../api', () => ({
  accessRequestsApi: accessRequests,
}));

vi.mock('./StarfieldBackground', () => ({
  StarfieldBackground: () => null,
}));

describe('Login viewer access', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('language', 'pt');
    auth.loginAsViewer.mockReset();
    accessRequests.cities.mockReset().mockResolvedValue({ cities: ['Nobre', 'Santa', 'Grande'] });
    accessRequests.create.mockReset();
    accessRequests.status.mockReset();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => vi.useRealTimers());

  it('submits every city selected for viewer access', async () => {
    render(
      <LanguageProvider>
        <Login />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /visualizador/i }));
    fireEvent.click((await screen.findByText('Selecione uma cidade')).closest('button')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Nobre' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Santa' }));
    fireEvent.click(screen.getByRole('button', { name: /visualizar produtos/i }));

    await waitFor(() => {
      expect(auth.loginAsViewer).toHaveBeenCalledWith(['Nobre', 'Santa']);
    });
  });

  it('keeps polling through consecutive pending responses until approval', async () => {
    vi.useFakeTimers();
    const receipt = { requestId: 'request-1', trackingSecret: 'secret', submissionKey: 'submission' };
    accessRequests.create.mockResolvedValue({ receipt });
    accessRequests.status
      .mockResolvedValueOnce({ status: 'PENDENTE' })
      .mockResolvedValueOnce({ status: 'PENDENTE' })
      .mockResolvedValueOnce({ status: 'APROVADO', reviewedAt: '2026-08-27T12:00:00Z' });

    render(<LanguageProvider><Login /></LanguageProvider>);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: /solicitar acesso/i }));
    await act(async () => Promise.resolve());
    fireEvent.change(screen.getByPlaceholderText('Seu nome'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByPlaceholderText('sem_espacos'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByRole('button', { name: /cidade \*/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Nobre' }));
    fireEvent.click(screen.getByRole('button', { name: /enviar pedido/i }));

    await act(async () => Promise.resolve());
    expect(screen.getByText(/solicitação pendente/i)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('sg_access_request_receipt') || 'null')).toEqual(receipt);

    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(screen.getByText(/solicitação pendente/i)).toBeInTheDocument();
    expect(accessRequests.status).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(1500));

    expect(screen.getByText(/solicitação aprovada/i)).toBeInTheDocument();
    expect(accessRequests.status).toHaveBeenCalledTimes(3);
  });

  it('pauses tracking while hidden and resumes immediately when visible', async () => {
    vi.useFakeTimers();
    const receipt = { requestId: 'request-1', trackingSecret: 'secret', submissionKey: 'submission' };
    sessionStorage.setItem('sg_access_request_receipt', JSON.stringify(receipt));
    accessRequests.status.mockResolvedValue({ status: 'APROVADO', reviewedAt: '2026-08-27T12:00:00Z' });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });

    render(<LanguageProvider><Login /></LanguageProvider>);
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(accessRequests.status).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));

    expect(accessRequests.status).toHaveBeenCalledWith(receipt);
    expect(screen.getByText(/solicitação aprovada/i)).toBeInTheDocument();
  });

  it('lets a rejected requester start a new request', async () => {
    vi.useFakeTimers();
    const receipt = { requestId: 'request-1', trackingSecret: 'secret', submissionKey: 'submission' };
    sessionStorage.setItem('sg_access_request_receipt', JSON.stringify(receipt));
    accessRequests.status.mockResolvedValue({ status: 'REPROVADO', rejectionReason: 'Dados inválidos' });

    render(<LanguageProvider><Login /></LanguageProvider>);
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    fireEvent.click(screen.getByRole('button', { name: /nova solicitação/i }));

    expect(screen.getByPlaceholderText('Seu nome')).toBeInTheDocument();
    expect(sessionStorage.getItem('sg_access_request_receipt')).toBeNull();
  });

  it.each([
    ['pt', 'PENDENTE', 'Solicitação pendente. Aguardando análise do administrador.'],
    ['pt', 'APROVADO', 'Solicitação aprovada. Use o primeiro acesso para ativar sua conta.'],
    ['pt', 'REPROVADO', 'Solicitação rejeitada. Revise os dados e envie um novo pedido.'],
    ['en', 'PENDENTE', 'Access request pending. Waiting for administrator review.'],
    ['en', 'APROVADO', 'Access request approved. Use first access to activate your account.'],
    ['en', 'REPROVADO', 'Access request rejected. Review the details and send a new request.'],
    ['es', 'PENDENTE', 'Solicitud de acceso pendiente. Esperando la revisión del administrador.'],
    ['es', 'APROVADO', 'Solicitud de acceso aprobada. Usa el primer acceso para activar tu cuenta.'],
    ['es', 'REPROVADO', 'Solicitud de acceso rechazada. Revisa los datos y envía una nueva solicitud.'],
  ] as const)('renders the %s tracking panel for a %s request', async (language, status, expectedText) => {
    vi.useFakeTimers();
    const receipt = { requestId: 'request-1', trackingSecret: 'secret', submissionKey: 'submission' };
    localStorage.setItem('language', language);
    sessionStorage.setItem('sg_access_request_receipt', JSON.stringify(receipt));
    accessRequests.status.mockResolvedValue(
      status === 'REPROVADO'
        ? { status, rejectionReason: 'Rejected by reviewer' }
        : { status },
    );

    render(<LanguageProvider><Login /></LanguageProvider>);
    await act(async () => vi.advanceTimersByTimeAsync(1500));

    expect(accessRequests.status).toHaveBeenCalledWith(receipt);
    expect(screen.getByText(expectedText)).toBeVisible();
  });
});
