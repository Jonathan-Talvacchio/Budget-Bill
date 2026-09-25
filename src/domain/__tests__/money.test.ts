/**
 * @jest-environment node
 */
import { centsToInput, parseMoneyToCents } from '../money';

describe('parseMoneyToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.05', 1205],
    ['0.99', 99],
    ['1,234.56', 123456],
    ['$9.99', 999],
    [' 15 ', 1500],
    ['12.', 1200],
  ])('parses %p', (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '-5', '1.234', '1e5', '12..3', '99999999999'])('rejects %p', (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it('avoids floating point error', () => {
    expect(parseMoneyToCents('0.29')).toBe(29);
    expect(parseMoneyToCents('1.15')).toBe(115);
  });
});

describe('centsToInput', () => {
  it('round-trips', () => {
    expect(centsToInput(1999)).toBe('19.99');
    expect(parseMoneyToCents(centsToInput(123456))).toBe(123456);
  });
});
