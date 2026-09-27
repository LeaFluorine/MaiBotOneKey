import { expect, test } from "bun:test";
import { webuiSessionCookie } from "../../src/main/services/local-chat-adapter";

test("WebUI cookie retains token punctuation instead of URL encoding it", () => {
  expect(webuiSessionCookie("Test+Token/=100%?#&"))
    .toBe('maibot_session="Test+Token/=100%?#&"');
});

test("WebUI cookie escapes cookie delimiters and quoted values", () => {
  expect(webuiSessionCookie('test;token,"\\ value'))
    .toBe('maibot_session="test\\073token\\054\\"\\\\\\040value"');
});

test("WebUI cookie escapes control characters instead of injecting headers", () => {
  expect(webuiSessionCookie("token\r\nInjected: value"))
    .toBe('maibot_session="token\\015\\012Injected:\\040value"');
});
