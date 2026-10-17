/** Three academy venue identities, reconstructed from the approved v0.7 calendar import. */
export const VENUES = [
 {id:'VENUE-MIDDLESBROUGH',name:'Middlesbrough Teaching Venue',location:'Middlesbrough',address:'54 Westbourne Grove, North Ormesby, Middlesbrough TS3 6EF',masterIds:['CLASS-RAAGA-MIDDLESBROUGH']},
 {id:'VENUE-DURHAM',name:'Framwellgate Moor Community Centre',location:'Durham',address:'Framwellgate Moor Community Centre, Front St, Durham DH1 5BL',masterIds:['CLASS-RAAGA-DURHAM']},
 {id:'VENUE-NEWCASTLE',name:'St. Aidans Community Centre',location:'Newcastle upon Tyne',address:'St. Aidans Community Centre, Princes Rd, Newcastle upon Tyne, NE3 5TT',masterIds:['CLASS-RAAGA-NEWCASTLE-1300','CLASS-RAAGA-NEWCASTLE-1330','CLASS-RAAGA-NEWCASTLE-1400','CLASS-RAAGA-NEWCASTLE-1430','CLASS-SRUTI-NEWCASTLE-VEDANTA']}
] as const;

export type Venue = (typeof VENUES)[number];
