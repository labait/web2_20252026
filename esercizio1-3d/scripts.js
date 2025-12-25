function animate() {
    // esempo con animazioni singole per sezione
    // gsap.from("#section1 .title div",{ y: 200, opacity: 0, duration: 0.5, stagger: 0.05 });
    // gsap.from("#section2 .title, #section3 .title",{ y: 500, opacity: 0, duration: 1,});

    // esempio con SplitText, vediamo nella prossima lezione, se leggi lascia un commento sul google doc :-) 
    gsap.registerPlugin(SplitText);
    const split1 = new SplitText("#section1 .title", {type:"lines,words,chars"});
    //gsap.from(split1.words, { 
    gsap.from(split1.lines, { 
      y: 50, 
      opacity: 0, 
      duration: 0.5, 
      stagger: 0.05,
      ease: "back.out",
      scrollTrigger: {
        trigger: "#section1",
        // start: "top center",
        // end: "bottom center",
        scrub: true,
        markers: true,
        pin: true,
      }
    });

    let tl2 = gsap.timeline({
      paused: true,
      scrollTrigger: {
        trigger: "#section2",
        // start: "top top",
        // end: "bottom top",
        scrub: true,
        pin: true,
        markers: true,
      }
    });
    tl2.from("#section2 .title",{ x: -800,opacity: 0, duration: 1,})
      .to("#section2 .title",{ scale: 1.5, duration: 1,})
      .to("#section2 .title",{ x: 1200, rotation: 30, duration: 1}, "-=0.5");

    // gsap.from("#section2 .title",{ 
    //   x: -800, 
    //   opacity: 0, 
    //   duration: 1,
    //   scrollTrigger: {    
    //     trigger: "#section2",
    //     pin: true,
    //     scrub: true,
    //     markers: true,
    //   }
    // });
  

}


document.addEventListener("DOMContentLoaded", animate);

window.addEventListener("load", animate);