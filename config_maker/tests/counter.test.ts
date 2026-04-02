import { describe, test, expect } from 'vitest'
import { Counter, ConfigMaker } from '../lib.js'
import Mustache from 'mustache'

describe('plain Counter', () => {
    test('with init 0, minimum 0', () => {
        const counter = new Counter(0, 0)
        expect(+counter).toBe(0)
        expect(counter.keep()).toBe("1")
        expect(+counter).toBe(1)
        expect(""+counter).toBe("2")
        expect(counter.incr()).toBe("3")
        expect(counter.keep()).toBe("4")
        expect(counter.set()("10", undefined)).toBeUndefined()
        expect(counter.keep()).toBe("10")
    })
    test('with init 1, minimum 0', () => {
        const counter = new Counter(1, 0)
        expect(+counter).toBe(1)
        expect(counter.keep()).toBe("2")
        expect(+counter).toBe(2)
        expect(""+counter).toBe("3")
        expect(counter.incr()).toBe("4")
        expect(counter.keep()).toBe("5")
        expect(counter.set()("10", undefined)).toBeUndefined()
        expect(counter.keep()).toBe("10")
    })
    test('with init 0, minimum 2', () => {
        const counter = new Counter(0, 2)
        expect(+counter).toBe(0)
        expect(counter.keep()).toBe("01")
        expect(+counter).toBe(1)
        expect(""+counter).toBe("02")
        expect(counter.incr()).toBe("03")
        expect(counter.keep()).toBe("04")
        expect(counter.set()("10", undefined)).toBeUndefined()
        expect(counter.keep()).toBe("10")
    })
    test('with init 0, minimum 2, pad " "', () => {
        const counter = new Counter(0, 2, " ")
        expect(+counter).toBe(0)
        expect(counter.keep()).toBe(" 1")
        expect(+counter).toBe(1)
        expect(""+counter).toBe(" 2")
        expect(counter.incr()).toBe(" 3")
        expect(counter.keep()).toBe(" 4")
        expect(counter.set()("10", undefined)).toBeUndefined()
        expect(counter.keep()).toBe("10")
    })
    test('parallel', () => {
        const counter1 = new Counter(1, 0)
        const counter2 = new Counter(0, 2)
        expect(+counter1).toBe(1)
        expect(+counter2).toBe(0)
        expect(counter1.keep()).toBe("2")
        expect(counter2.keep()).toBe("01")
        expect(+counter1).toBe(2)
        expect(+counter2).toBe(1)
        expect(""+counter1).toBe("3")
        expect(""+counter2).toBe("02")
        expect(counter1.incr()).toBe("4")
        expect(counter2.incr()).toBe("03")
        expect(counter1.keep()).toBe("5")
        expect(counter2.keep()).toBe("04")
        expect(counter1.set()("10", undefined)).toBeUndefined()
        expect(counter2.set()("20", undefined)).toBeUndefined()
        expect(counter1.keep()).toBe("10")
        expect(counter2.keep()).toBe("20")
    })
    test('invalid set', () => {
        const counter = new Counter(2, 0)
        expect(() => counter.set()("abc", undefined)).toThrow('Counter value must be a number, but got "abc"')
        expect(counter.keep()).toBe("2")
    })
})

describe('Counter with Mustache', () => {
    test('plain', () => {
        const { make_counter } = (new ConfigMaker('', '')).make_context()
        expect(Mustache.render('{{counter}}{{counter}}{{counter}}', { counter: make_counter(0, 4, '0') })).toBe('000000010002')
    })
    test('keep', () => {
        const { make_counter } = (new ConfigMaker('', '')).make_context()
        expect(Mustache.render('{{counter}}{{counter.keep}}{{counter}}', { counter: make_counter(0, 4, '0') })).toBe('000000010001')
    })
    test('incr', () => {
        const { make_counter } = (new ConfigMaker('', '')).make_context()
        expect(Mustache.render('{{counter}}{{counter.incr}}{{counter}}', { counter: make_counter(0, 4, '0') })).toBe('000000010002')
    })
    test('set', () => {
        const { make_counter } = (new ConfigMaker('', '')).make_context()
        expect(Mustache.render('{{counter}}{{#counter.set}}3{{/counter.set}}{{counter}}{{counter}}', { counter: make_counter(0, 4, '0') })).toBe('000000030004')
    })
    test('parallel', () => {
        const { make_counter } = (new ConfigMaker('', '')).make_context()
        expect(
            Mustache.render('{{counter1}}{{counter2}}{{counter2}}{{counter1}}',
            { counter1: make_counter(0, 4, '0'), counter2: make_counter(5, 4, '0') })
        ).toBe('0000000500060001')
    })
    test('invalid set', () => {
        const { make_counter } = (new ConfigMaker('', '')).make_context()
        expect(() => Mustache.render(
            '{{counter}}{{#counter.set}}abc{{/counter.set}}{{counter}}{{counter}}',
            { counter: make_counter(0, 4, '0') })
        ).toThrow('Counter value must be a number, but got "abc"')
    })
})
