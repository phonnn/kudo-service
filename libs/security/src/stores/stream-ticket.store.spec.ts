import { StreamTicketStore } from './stream-ticket.store';

const principal = { subject: 'user-1', claims: {} };

describe('StreamTicketStore', () => {
  it('issues a ticket that consumes back to the same principal', () => {
    const store = new StreamTicketStore();
    const ticket = store.issue(principal);

    expect(store.consume(ticket)).toEqual(principal);
  });

  it('is single-use: consuming the same ticket twice fails the second time', () => {
    const store = new StreamTicketStore();
    const ticket = store.issue(principal);

    store.consume(ticket);
    expect(store.consume(ticket)).toBeNull();
  });

  it('returns null for a ticket that was never issued', () => {
    const store = new StreamTicketStore();
    expect(store.consume('unknown-ticket')).toBeNull();
  });

  it('returns null once the ticket has expired', () => {
    jest.useFakeTimers();
    try {
      const store = new StreamTicketStore();
      const ticket = store.issue(principal);

      jest.advanceTimersByTime(30_001);
      expect(store.consume(ticket)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
