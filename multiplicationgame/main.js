class State {
  /**
   * @param {{
   * entering: (this: State) => void,
   * leaving: (this: State) => void
   * }} callbacks cbs
   */
  constructor(callbacks) {
    if (!callbacks) {
      return
    }

    ['entering', 'leaving'].forEach(cb => {
      if (callbacks[cb]) {
        this[cb] = callbacks[cb].bind(this)
      }
    })
  }

  /**
   * @param {State} state
   */
  transitionTo(state) {
    const leaving = this.machine.currentState.leaving
    leaving && leaving();
    this.machine.currentState = state
    const entering = this.machine.currentState.entering
    entering && entering();
  }
}

/**
 * @param {...State} states lis
 */
function startStateMachine(...states) {
  const machine = {
    currentState: states[0]
  }
  machine.currentState.entering()
  states.forEach(e => e.machine = machine)
}

const mainScreen = new State({
  entering() {
    document.querySelector("#checkboxForm").style.display = "block"
    document.querySelector("#checkboxForm > button").onclick = () => {
      game.selected = []
      for (let i = 1; i <= 9; i++) {
        const checkbox = document.querySelector(`input[name=checkbox${i}]`)
        if (checkbox.checked) {
          game.selected.push(i)
        }
      }
      if (game.selected.length === 0) {
        alert('Choose at least one multiplication table')
      }
      else {
        this.transitionTo(game)
      }
    }
  },
  leaving() {
    document.querySelector("#checkboxForm").style.display = "none"
  },
})
const game = new State({
  entering() {
    const answerTextBox = document.querySelector('#answer')
    document.querySelector('#game').style.display = 'block'
    const changeOrder = Math.random() < 0.5
    const newQuestion = () => {
      answerTextBox.value = ""
      const a = Math.floor(Math.random() * 10) + 1
      const b = game.selected[Math.floor(Math.random() * game.selected.length)]
      this.rightAnswer = a * b;
      const [i, j] = changeOrder ? [b, a] : [a, b]
      const question = `${i} × ${j}`
      document.querySelector('#answerContainer > h2').textContent = question
    }
    answerTextBox.focus({ focusVisible: true })
    answerTextBox.onpaste = e => e.preventDefault()
    answerTextBox.onkeypress = e => {
      if (isNaN(Number.parseInt(e.key))) {
        e.preventDefault()
      }
    }
    answerTextBox.oninput = () => {
      if (this.rightAnswer == answerTextBox.value) {
        game.score++
        game.rounds++
        newQuestion()
      }
    }
    game.score = 0
    game.rounds = 0
    newQuestion()

    const progressIndicator = document.querySelector('#progress')
    const gameDuration = 60000
    const endTime = Date.now() + gameDuration
    requestAnimationFrame(function cb() {
      const now = Date.now()
      const left = (endTime - now) / gameDuration * 100
      const progress = 100 - left
      progressIndicator.style.clipPath = `polygon(0% 0%, 100% 0%, 100% ${progress}%, 0% ${progress}%)`
      if (progress >= 100) {
        game.transitionTo(resultScreen)
      }
      else {
        requestAnimationFrame(cb)
      }
    })
  },
  leaving() {
    document.querySelector('#game').style.display = 'none'
  }
})
const resultScreen = new State({
  entering() {
    const container = document.querySelector("#resultScreen")
    container.style.display = "block"
    const h2 = container.querySelector("h2")
    h2.textContent = `You got ${game.score} points!`

    document.querySelector("#restartButton").onclick = function cb() {
      resultScreen.transitionTo(game)
    }
    document.querySelector("#selectTablesButton").onclick = function cb() {
      resultScreen.transitionTo(mainScreen)
    }
  },
  leaving() {
    const container = document.querySelector("#resultScreen")
    container.style.display = "none"
  },
})

startStateMachine(mainScreen, game, resultScreen)